import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { PLATFORM_CONFIG } from '../services/config.ts';
import { getSupabaseClient } from '../services/supabaseService.ts';
import { freeAiAdapter } from './adapters/freeAiAdapter.ts';
import { geminiAdapter } from './adapters/geminiAdapter.ts';
import { nezukoAdapter } from './adapters/nezukoAdapter.ts';
import { runCloudflareWorkersAiChat, streamOpenAiCompatibleChat } from './adapters/openAiCompatAdapter.ts';
import { pollinationsAdapter } from './adapters/pollinationsAdapter.ts';
import { DISCOVERED_FREE_PROVIDERS, OPEN_SOURCE_MODEL_EVALUATIONS } from './freeProviderCatalog.ts';
import {
  getProviderById,
  listProviders,
  recordEndpointTelemetry,
  setProviderHealth,
} from './registry.ts';
import {
  getProviderCooldownRemainingSec,
  recordGatewayLog,
  redactSensitiveString,
} from './reliability.ts';
import type {
  DetailedAvailabilityStatus,
  EndpointTestResult,
  GatewayEndpointDoc,
  ProviderRecord,
} from './types.ts';

const endpointTestHistory: EndpointTestResult[] = [];
const latestEndpointResultMap = new Map<string, EndpointTestResult>();

function formatFreeTierLimits(provider: ProviderRecord): string {
  const f = provider.freeTierLimits;
  const parts: string[] = [];
  if (f.rpm) parts.push(`${f.rpm} RPM`);
  if (f.rpd) parts.push(`${f.rpd} RPD`);
  if (f.tpm) parts.push(`${f.tpm} TPM`);
  if (f.dailyNeurons) parts.push(`${f.dailyNeurons} Neurons/day`);
  if (f.cooldownSeconds) parts.push(`1 req / ${f.cooldownSeconds}s IP`);
  if (f.monthlyCredits) parts.push(f.monthlyCredits);
  return parts.length > 0 ? `${parts.join(' · ')} — ${f.notes}` : f.notes;
}

function saveTestResult(result: EndpointTestResult) {
  latestEndpointResultMap.set(result.endpointId, result);
  endpointTestHistory.unshift(result);
  if (endpointTestHistory.length > 150) {
    endpointTestHistory.length = 150;
  }

  const supa = getSupabaseClient();
  if (supa) {
    void supa
      .from('nova_api_endpoint_tests')
      .insert({
        provider_slug: result.providerSlug,
        endpoint_id: result.endpointId,
        endpoint_url: result.endpointUrl,
        model_name: result.modelName,
        capability: result.capability,
        dns_resolved: result.dnsResolved,
        http_status: result.httpStatus,
        response_time_ms: result.responseTimeMs,
        validation_passed: result.validationPassed,
        validation_details: result.validationDetails,
        availability_status: result.status,
        error_message: result.errorMessage || null,
      })
      .then(() => {});
  }
}

async function resolveDnsHost(rawUrl: string): Promise<{ resolved: boolean; address?: string }> {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname || parsed.protocol === 'internal:') {
      return { resolved: true, address: 'internal' };
    }
    const res = await lookup(parsed.hostname);
    return { resolved: true, address: res.address };
  } catch {
    return { resolved: false };
  }
}

function classifyOutcomeStatus(params: {
  httpStatus: number;
  validationPassed: boolean;
  errorMessage?: string;
}): DetailedAvailabilityStatus {
  const errLower = (params.errorMessage || '').toLowerCase();
  if (
    params.httpStatus === 401 ||
    params.httpStatus === 403 ||
    errLower.includes('not configured') ||
    errLower.includes('unauthorized')
  ) {
    return 'Authentication required';
  }
  if (
    params.httpStatus === 429 ||
    params.httpStatus === 402 ||
    errLower.includes('rate limit') ||
    errLower.includes('free_limit') ||
    errLower.includes('cooldown') ||
    errLower.includes('insufficient_credits') ||
    errLower.includes('daily_remaining') ||
    errLower.includes('not enough tokens')
  ) {
    return 'Rate limited';
  }
  if (params.validationPassed && params.httpStatus >= 200 && params.httpStatus < 300) {
    return 'Working';
  }
  if (params.httpStatus >= 200 && params.httpStatus < 300 && !params.validationPassed) {
    return 'Degraded';
  }
  return 'Unavailable';
}

export async function testEndpointById(
  provider: ProviderRecord,
  ep: GatewayEndpointDoc,
  options?: { runImageChecks?: boolean }
): Promise<EndpointTestResult> {
  const startMs = Date.now();
  const fullUrl =
    ep.path.startsWith('http') || ep.path.startsWith('sdk:')
      ? ep.path
      : `${provider.baseUrl.replace(/\/+$/, '')}${ep.path.startsWith('/') ? ep.path : `/${ep.path}`}`;
  const dns = await resolveDnsHost(provider.baseUrl);

  let httpStatus = 0;
  let validationPassed = false;
  let validationDetails = '';
  let sampleOutput: string | undefined;
  let errorMessage: string | undefined;

  try {
    if (!dns.resolved && provider.baseUrl.startsWith('http')) {
      throw new Error(`DNS lookup failed for ${provider.baseUrl}`);
    }

    if (provider.slug === 'free_ai_custom') {
      const res = await freeAiAdapter.streamChat(
        [{ role: 'user', content: 'Hello, respond briefly in Arabic.' }],
        { onDelta: () => {}, onImage: () => {} }
      );
      httpStatus = 200;
      const hasArabicOrText = typeof res.text === 'string' && res.text.trim().length > 0;
      validationPassed = hasArabicOrText;
      validationDetails = hasArabicOrText
        ? `SSE stream parsed cleanly (${res.text.trim().length} chars)`
        : 'HTTP 200 received but SSE text stream was empty';
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'pollinations_text') {
      const res = await pollinationsAdapter.streamTextChat(
        [{ role: 'user', content: 'Reply with OK' }],
        { onDelta: () => {} }
      );
      httpStatus = 200;
      validationPassed = res.text.trim().length > 0;
      validationDetails = `Anonymous OpenAI SSE verified (${res.modelUsed})`;
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'pollinations_image') {
      const cooldown = getProviderCooldownRemainingSec('pollinations_image');
      if (cooldown > 0 || !options?.runImageChecks) {
        httpStatus = cooldown > 0 ? 402 : 200;
        validationPassed = false;
        validationDetails =
          cooldown > 0
            ? `Cooldown guard active (${cooldown}s remaining of 45s per-IP limit)`
            : 'Skipped heavy image generation in lightweight pass; 45s/IP cooldown enforced by upstream';
        errorMessage = cooldown > 0 ? '45s per-IP free cooldown active' : undefined;
      } else {
        const res = await fetch(
          `https://image.pollinations.ai/prompt/minimal%20geometric%20icon%20${Date.now()}?width=256&height=256&nologo=true`,
          { signal: AbortSignal.timeout(20_000) }
        );
        httpStatus = res.status;
        const ct = res.headers.get('content-type') || '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.status === 402 || res.status === 429) {
          validationPassed = false;
          validationDetails = 'Upstream enforces 1 image / 45s per IP (HTTP 402 FREE_LIMIT)';
          errorMessage = buf.toString('utf8').slice(0, 180);
        } else if (res.ok && ct.startsWith('image/') && buf.length > 1024) {
          validationPassed = true;
          validationDetails = `Valid ${ct} image buffer returned (${buf.length} bytes)`;
        } else {
          validationPassed = false;
          validationDetails = `Invalid image payload (${ct}, ${buf.length} bytes)`;
        }
      }
    } else if (provider.slug === 'nezuko') {
      if (ep.id === 'ep_nezuko_yt') {
        const res = await nezukoAdapter.youtubeSearch('lofi');
        httpStatus = res.status;
        const count = res.data?.results?.length ?? 0;
        validationPassed = res.ok && count > 0;
        validationDetails = `Validated YouTube JSON (${count} videos)`;
        sampleOutput = res.data?.results?.[0]?.title;
      } else if (ep.id === 'ep_nezuko_pin') {
        const res = await nezukoAdapter.pinterestSearch('minimalist');
        httpStatus = res.status;
        const count = res.data?.results?.length ?? 0;
        validationPassed = res.ok && count > 0;
        validationDetails = `Validated Pinterest JSON (${count} pins)`;
        sampleOutput = res.data?.results?.[0]?.title;
      } else if (ep.id === 'ep_nezuko_qwen') {
        const res = await nezukoAdapter.qwen7b({ prompt: 'Reply with OK', model: 'qwen7b', lang: 'en' });
        httpStatus = res.status;
        validationPassed = Boolean(res.ok && res.data?.reply?.trim());
        validationDetails = validationPassed ? 'Validated Qwen-7B JSON reply' : 'Empty reply field';
        sampleOutput = res.data?.reply?.slice(0, 120);
      } else if (ep.id === 'ep_nezuko_gemini') {
        const res = await nezukoAdapter.geminiChat({ prompt: 'أجب بكلمة مرحبا فقط', lang: 'ar' });
        httpStatus = res.status;
        validationPassed = Boolean(res.ok && res.data?.reply?.trim());
        validationDetails = validationPassed ? 'Validated multipart/form-data Arabic reply' : 'Empty reply field';
        sampleOutput = res.data?.reply?.slice(0, 120);
      } else if (ep.id === 'ep_nezuko_img_hd') {
        const res = await nezukoAdapter.imageToHd(
          'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/240px-React-icon.svg.png'
        );
        httpStatus = res.status;
        validationPassed = Boolean(res.ok && (res.data?.imageUrl || res.data?.imageBase64DataUrl));
        validationDetails = 'Validated enhanced image output';
      } else if (ep.id === 'ep_nezuko_dl') {
        const res = await nezukoAdapter.downloadMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        httpStatus = res.status;
        const raw = res.data as Record<string, unknown> | undefined;
        const itemsArr = Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.medias)
            ? raw.medias
            : [];
        validationPassed = Boolean(res.ok && (itemsArr.length > 0 || typeof raw?.url === 'string'));
        validationDetails = `Validated media items (${itemsArr.length})`;
      } else if (ep.id === 'ep_nezuko_flux') {
        const res = await nezukoAdapter.fluxImage('minimal blue cube', 'square');
        httpStatus = res.status;
        validationPassed = Boolean(res.ok && (res.data?.imageUrl || res.data?.imageBase64DataUrl));
        validationDetails = 'Validated Flux image output';
      } else if (ep.id === 'ep_nezuko_monte') {
        const res = await nezukoAdapter.monteAiImage('minimal blue cube');
        httpStatus = res.status;
        validationPassed = Boolean(res.ok && (res.data?.imageUrl || res.data?.imageBase64DataUrl));
        validationDetails = 'Validated Monte AI image output';
      }
    } else if (provider.slug === 'google_gemini') {
      if (!process.env.GEMINI_API_KEY?.trim()) {
        httpStatus = 401;
        errorMessage = 'GEMINI_API_KEY is not configured in Settings > Secrets.';
        validationDetails = 'Authentication required before calling Gemini API';
      } else {
        const stream = await geminiAdapter.streamChat({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
        });
        let text = '';
        for await (const chunk of stream) text += chunk.text ?? '';
        httpStatus = 200;
        validationPassed = text.trim().length > 0;
        validationDetails = 'Gemini SDK stream validated';
        sampleOutput = text.trim().slice(0, 120);
      }
    } else if (provider.slug === 'groq') {
      const res = await streamOpenAiCompatibleChat(
        {
          providerSlug: 'groq',
          endpoint: provider.baseUrl,
          apiKeyEnvVar: 'GROQ_API_KEY',
          model: 'llama-3.3-70b-versatile',
        },
        [{ role: 'user', content: 'Reply OK' }],
        () => {}
      );
      httpStatus = 200;
      validationPassed = res.text.trim().length > 0;
      validationDetails = 'Groq SSE response validated';
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'openrouter_free') {
      const res = await streamOpenAiCompatibleChat(
        {
          providerSlug: 'openrouter_free',
          endpoint: provider.baseUrl,
          apiKeyEnvVar: 'OPENROUTER_API_KEY',
          model: 'openrouter/free',
          extraHeaders: { 'HTTP-Referer': 'https://nova.vanitasbot.my.id', 'X-Title': 'NOVA' },
        },
        [{ role: 'user', content: 'Reply OK' }],
        () => {}
      );
      httpStatus = 200;
      validationPassed = res.text.trim().length > 0;
      validationDetails = 'OpenRouter :free SSE response validated';
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'huggingface_inference') {
      const res = await streamOpenAiCompatibleChat(
        {
          providerSlug: 'huggingface_inference',
          endpoint: provider.baseUrl,
          apiKeyEnvVar: 'HF_TOKEN',
          model: 'Qwen/Qwen2.5-7B-Instruct',
        },
        [{ role: 'user', content: 'Reply OK' }],
        () => {}
      );
      httpStatus = 200;
      validationPassed = res.text.trim().length > 0;
      validationDetails = 'Hugging Face Inference response validated';
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'cloudflare_workers_ai') {
      const res = await runCloudflareWorkersAiChat('@cf/meta/llama-3.1-8b-instruct', [
        { role: 'user', content: 'Reply OK' },
      ]);
      httpStatus = 200;
      validationPassed = res.text.trim().length > 0;
      validationDetails = 'Cloudflare Workers AI response validated';
      sampleOutput = res.text.trim().slice(0, 120);
    } else if (provider.slug === 'anilist') {
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query { Page(page:1,perPage:1){ media(type:ANIME){ id title{ romaji } } } }' }),
        signal: AbortSignal.timeout(10_000),
      });
      httpStatus = resp.status;
      const json = (await resp.json().catch(() => null)) as {
        data?: { Page?: { media?: Array<{ title?: { romaji?: string } }> } };
      } | null;
      const title = json?.data?.Page?.media?.[0]?.title?.romaji;
      validationPassed = Boolean(resp.ok && title);
      validationDetails = validationPassed ? 'AniList GraphQL returned media metadata' : 'GraphQL payload empty';
      sampleOutput = title;
    } else {
      const resp = await fetch(provider.baseUrl, { signal: AbortSignal.timeout(10_000) });
      httpStatus = resp.status;
      validationPassed = resp.ok;
      validationDetails = `HTTP ${resp.status}`;
    }
  } catch (err) {
    const statusErr = (err as { status?: number }).status;
    httpStatus = statusErr || httpStatus || 502;
    errorMessage = redactSensitiveString(err instanceof Error ? err.message : String(err));
    validationPassed = false;
    validationDetails = errorMessage;
  }

  const responseTimeMs = Date.now() - startMs;
  let status = classifyOutcomeStatus({ httpStatus, validationPassed, errorMessage });
  if (
    provider.slug === 'pollinations_image' &&
    !options?.runImageChecks &&
    !validationPassed &&
    !errorMessage
  ) {
    status = 'Not tested';
  }

  recordEndpointTelemetry({
    providerSlug: provider.slug,
    endpointId: ep.id,
    httpStatus,
    responseTimeMs,
    passed: validationPassed,
    status,
  });

  const totalRuns = (ep.successCount || 0) + (ep.errorCount || 0);
  const successRatePct = totalRuns > 0 ? Math.round(((ep.successCount || 0) / totalRuns) * 1000) / 10 : 0;
  const errorRatePct = totalRuns > 0 ? Math.round(((ep.errorCount || 0) / totalRuns) * 1000) / 10 : 0;

  const result: EndpointTestResult = {
    id: `ep_test_${randomUUID().slice(0, 8)}`,
    providerId: provider.id,
    providerSlug: provider.slug,
    providerName: provider.name,
    endpointId: ep.id,
    endpointName: ep.name,
    endpointUrl: fullUrl,
    modelName: ep.modelName || ep.id,
    capability: ep.capability,
    dnsResolved: dns.resolved,
    resolvedAddress: dns.address,
    httpStatus,
    responseTimeMs,
    validationPassed,
    validationDetails,
    sampleOutput: sampleOutput ? redactSensitiveString(sampleOutput) : undefined,
    status,
    errorMessage,
    freeTierLimits: formatFreeTierLimits(provider),
    successRatePct,
    errorRatePct,
    testedAt: new Date().toISOString(),
  };

  saveTestResult(result);
  recordGatewayLog({
    requestId: `apitest_${randomUUID().slice(0, 8)}`,
    providerSlug: provider.slug,
    modelId: ep.modelName || ep.id,
    endpoint: fullUrl,
    method: ep.method,
    statusCode: httpStatus,
    durationMs: responseTimeMs,
    success: validationPassed,
    errorClass: validationPassed ? undefined : status === 'Authentication required' ? 'MISSING_CREDENTIALS' : 'UPSTREAM_UNAVAILABLE',
    errorMessage,
    meta: { automatedTest: true, dnsResolved: dns.resolved, status },
  });

  return result;
}

export async function testProviderEndpoints(providerId: string): Promise<EndpointTestResult[]> {
  const provider = getProviderById(providerId);
  if (!provider) throw new Error('Provider not found.');
  if (provider.endpoints.length === 0) return [];

  const results: EndpointTestResult[] = [];
  for (const ep of provider.endpoints) {
    const r = await testEndpointById(provider, ep, { runImageChecks: true });
    results.push(r);
  }

  const anyWorking = results.some((r) => r.status === 'Working');
  const allWorking = results.every((r) => r.status === 'Working');
  const authReq = results.every((r) => r.status === 'Authentication required');
  const rateLimited = results.every((r) => r.status === 'Rate limited');
  const avgMs = Math.round(results.reduce((s, r) => s + r.responseTimeMs, 0) / results.length);

  if (allWorking) {
    setProviderHealth(provider.slug, 'healthy', undefined, 'Working', avgMs);
  } else if (anyWorking) {
    setProviderHealth(provider.slug, 'degraded', 'Some endpoints are degraded or unavailable.', 'Degraded', avgMs);
  } else if (authReq) {
    setProviderHealth(provider.slug, 'unavailable', results[0]?.errorMessage, 'Authentication required', avgMs);
  } else if (rateLimited) {
    setProviderHealth(provider.slug, 'degraded', results[0]?.errorMessage, 'Rate limited', avgMs);
  } else {
    setProviderHealth(provider.slug, 'unavailable', results[0]?.errorMessage, 'Unavailable', avgMs);
  }

  return results;
}

export async function runFullApiDiagnosticSuite(): Promise<{
  testedAt: string;
  summary: Record<DetailedAvailabilityStatus, number>;
  results: EndpointTestResult[];
}> {
  const results: EndpointTestResult[] = [];
  for (const provider of listProviders()) {
    if (!provider.enabled || provider.endpoints.length === 0) continue;
    const provResults = await testProviderEndpoints(provider.id);
    results.push(...provResults);
  }

  const summary: Record<DetailedAvailabilityStatus, number> = {
    Working: 0,
    Degraded: 0,
    Unavailable: 0,
    'Not tested': 0,
    'Authentication required': 0,
    'Rate limited': 0,
  };
  for (const r of results) {
    summary[r.status] += 1;
  }

  return {
    testedAt: new Date().toISOString(),
    summary,
    results,
  };
}

export function getApiHealthMatrix() {
  const rows: Array<{
    providerId: string;
    providerName: string;
    providerSlug: string;
    apiEndpoint: string;
    endpointId: string;
    modelName: string;
    capability: string;
    connectionStatus: DetailedAvailabilityStatus;
    lastTestTime: string | null;
    responseTimeMs: number | null;
    successRatePct: number;
    errorRatePct: number;
    freeTierLimits: string;
    currentAvailability: string;
    lastError?: string;
  }> = [];

  for (const provider of listProviders()) {
    if (provider.slug === 'nova_router') continue;
    for (const ep of provider.endpoints) {
      const latest = latestEndpointResultMap.get(ep.id);
      const total = (ep.successCount || 0) + (ep.errorCount || 0);
      const successRatePct = total > 0 ? Math.round(((ep.successCount || 0) / total) * 1000) / 10 : ep.availabilityStatus === 'Working' ? 100 : 0;
      const errorRatePct = total > 0 ? Math.round(((ep.errorCount || 0) / total) * 1000) / 10 : 0;
      const status: DetailedAvailabilityStatus = latest?.status || ep.availabilityStatus || 'Not tested';
      const fullUrl =
        ep.path.startsWith('http') || ep.path.startsWith('sdk:')
          ? ep.path
          : `${provider.baseUrl.replace(/\/+$/, '')}${ep.path.startsWith('/') ? ep.path : `/${ep.path}`}`;

      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        providerSlug: provider.slug,
        apiEndpoint: fullUrl,
        endpointId: ep.id,
        modelName: ep.modelName || ep.id,
        capability: ep.capability,
        connectionStatus: status,
        lastTestTime: latest?.testedAt || ep.lastTestedAt || null,
        responseTimeMs: latest?.responseTimeMs ?? ep.lastResponseTimeMs ?? null,
        successRatePct,
        errorRatePct,
        freeTierLimits: formatFreeTierLimits(provider),
        currentAvailability:
          status === 'Working'
            ? 'Operational'
            : status === 'Authentication required'
              ? `Key Required (${String((provider.config as { envVar?: string }).envVar || 'Env Secret')})`
              : status === 'Rate limited'
                ? 'Throttled / Cooldown'
                : status === 'Degraded'
                  ? 'Partial Availability'
                  : status === 'Not tested'
                    ? 'Pending Probe'
                    : 'Offline Upstream',
        lastError: latest?.errorMessage || ep.knownLimitations,
      });
    }
  }

  return {
    matrix: rows,
    recentTests: endpointTestHistory.slice(0, 60),
    discoveredProviders: DISCOVERED_FREE_PROVIDERS,
    openSourceEvaluations: OPEN_SOURCE_MODEL_EVALUATIONS,
    configNotice: PLATFORM_CONFIG.freeAiEndpoint ? 'Free endpoints read from env/config' : '',
  };
}
