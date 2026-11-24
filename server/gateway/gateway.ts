import { randomUUID } from 'node:crypto';
import {
  getModelById,
  getProviderById,
  getProviderBySlug,
  listFallbackRules,
  listModels,
  listProviders,
  resolveCompatibleFallback,
  setProviderHealth,
} from './registry.ts';
import {
  canExecuteCircuit,
  checkRateLimit,
  classifyGatewayError,
  getAllCircuitStates,
  getGatewayLogs,
  getUsageStatistics,
  recordCircuitFailure,
  recordCircuitSuccess,
  recordGatewayLog,
} from './reliability.ts';
import { nezukoAdapter } from './adapters/nezukoAdapter.ts';
import { freeAiAdapter } from './adapters/freeAiAdapter.ts';
import { geminiAdapter } from './adapters/geminiAdapter.ts';
import type { GatewayResponse, ProviderCapability } from './types.ts';

export interface GatewayCallOptions<T> {
  providerSlug: string;
  modelId: string;
  capability: ProviderCapability;
  type: GatewayResponse['type'];
  endpoint: string;
  method: 'GET' | 'POST';
  rateLimitKey?: string;
  ipHash?: string;
  requiresImageInput?: boolean;
  execute: (resolvedModelId: string, resolvedProviderSlug: string) => Promise<T>;
}

export async function executeGatewayCall<T>(opts: GatewayCallOptions<T>): Promise<GatewayResponse<T>> {
  const requestId = `req_${randomUUID().slice(0, 12)}`;
  const startMs = Date.now();

  if (opts.rateLimitKey) {
    const rl = checkRateLimit(opts.rateLimitKey, 90, 60_000);
    if (!rl.allowed) {
      return {
        success: false,
        provider: opts.providerSlug,
        model: opts.modelId,
        type: opts.type,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.`,
          classification: 'RATE_LIMITED',
          retryable: true,
          status: 429,
        },
        metadata: {
          request_id: requestId,
          duration_ms: Date.now() - startMs,
          endpoint: opts.endpoint,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  const primaryProvider = getProviderBySlug(opts.providerSlug);
  const primaryModel = getModelById(opts.modelId);

  if (!primaryProvider || !primaryProvider.enabled) {
    return {
      success: false,
      provider: opts.providerSlug,
      model: opts.modelId,
      type: opts.type,
      data: null,
      error: {
        code: 'PROVIDER_DISABLED',
        message: `Provider "${opts.providerSlug}" is disabled or not registered.`,
        classification: 'UNSUPPORTED_CAPABILITY',
        retryable: false,
        status: 503,
      },
      metadata: {
        request_id: requestId,
        duration_ms: Date.now() - startMs,
        endpoint: opts.endpoint,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (primaryModel && !primaryModel.active) {
    return {
      success: false,
      provider: opts.providerSlug,
      model: opts.modelId,
      type: opts.type,
      data: null,
      error: {
        code: 'MODEL_INACTIVE',
        message: `Model "${opts.modelId}" is currently inactive.`,
        classification: 'UNSUPPORTED_CAPABILITY',
        retryable: false,
        status: 503,
      },
      metadata: {
        request_id: requestId,
        duration_ms: Date.now() - startMs,
        endpoint: opts.endpoint,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const runAttempt = async (modelId: string, providerSlug: string) => {
    if (!canExecuteCircuit(providerSlug)) {
      const err = new Error(`Circuit breaker is open for provider "${providerSlug}".`) as Error & { status?: number };
      err.status = 503;
      throw err;
    }
    const data = await opts.execute(modelId, providerSlug);
    recordCircuitSuccess(providerSlug);
    setProviderHealth(providerSlug, 'healthy');
    return data;
  };

  try {
    const data = await runAttempt(opts.modelId, opts.providerSlug);
    const durationMs = Date.now() - startMs;

    recordGatewayLog({
      requestId,
      providerSlug: opts.providerSlug,
      modelId: opts.modelId,
      endpoint: opts.endpoint,
      method: opts.method,
      statusCode: 200,
      durationMs,
      success: true,
      ipHash: opts.ipHash,
    });

    return {
      success: true,
      provider: opts.providerSlug,
      model: opts.modelId,
      type: opts.type,
      data,
      error: null,
      metadata: {
        request_id: requestId,
        duration_ms: durationMs,
        endpoint: opts.endpoint,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (primaryErr) {
    const status = (primaryErr as { status?: number }).status;
    const classified = classifyGatewayError(primaryErr, status);
    recordCircuitFailure(opts.providerSlug);
    setProviderHealth(opts.providerSlug, classified.classification === 'UPSTREAM_UNAVAILABLE' ? 'unavailable' : 'degraded', classified.message);

    // Attempt capability-compatible fallback if eligible
    const fallbackModel = resolveCompatibleFallback({
      capability: opts.capability,
      primaryModelId: opts.modelId,
      requiresImageInput: opts.requiresImageInput,
    });

    if (fallbackModel && canExecuteCircuit(fallbackModel.providerSlug)) {
      try {
        const fbData = await runAttempt(fallbackModel.id, fallbackModel.providerSlug);
        const durationMs = Date.now() - startMs;
        recordGatewayLog({
          requestId,
          providerSlug: fallbackModel.providerSlug,
          modelId: fallbackModel.id,
          endpoint: opts.endpoint,
          method: opts.method,
          statusCode: 200,
          durationMs,
          success: true,
          ipHash: opts.ipHash,
          meta: { fallbackFrom: opts.modelId, primaryError: classified.code },
        });
        return {
          success: true,
          provider: fallbackModel.providerSlug,
          model: fallbackModel.id,
          type: opts.type,
          data: fbData,
          error: null,
          metadata: {
            request_id: requestId,
            duration_ms: durationMs,
            fallback_used: true,
            fallback_from: opts.modelId,
            endpoint: opts.endpoint,
            timestamp: new Date().toISOString(),
          },
        };
      } catch {
        // Fall through to report primary failure transparently
      }
    }

    const durationMs = Date.now() - startMs;
    recordGatewayLog({
      requestId,
      providerSlug: opts.providerSlug,
      modelId: opts.modelId,
      endpoint: opts.endpoint,
      method: opts.method,
      statusCode: classified.status || 502,
      durationMs,
      success: false,
      errorClass: classified.classification,
      errorMessage: classified.message,
      ipHash: opts.ipHash,
    });

    return {
      success: false,
      provider: opts.providerSlug,
      model: opts.modelId,
      type: opts.type,
      data: null,
      error: classified,
      metadata: {
        request_id: requestId,
        duration_ms: durationMs,
        endpoint: opts.endpoint,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function testProviderConnectivity(providerId: string) {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw new Error('Provider not found.');
  }

  const startMs = Date.now();
  const requestId = `test_${randomUUID().slice(0, 8)}`;

  try {
    if (provider.slug === 'free_ai_custom') {
      const res = await freeAiAdapter.streamChat(
        [{ role: 'user', content: 'Say OK' }],
        { onDelta: () => {}, onImage: () => {} }
      );
      const durationMs = Date.now() - startMs;
      const valid = typeof res.text === 'string' && res.text.trim().length > 0;
      setProviderHealth(provider.slug, valid ? 'healthy' : 'degraded');
      if (provider.endpoints[0]) {
        provider.endpoints[0].lastTestedAt = new Date().toISOString();
        provider.endpoints[0].lastHttpStatus = 200;
      }
      recordGatewayLog({
        requestId,
        providerSlug: provider.slug,
        modelId: 'free_ai_custom:qwen7b',
        endpoint: provider.baseUrl,
        method: 'POST',
        statusCode: 200,
        durationMs,
        success: valid,
      });
      return {
        connected: valid,
        httpStatus: 200,
        durationMs,
        validationResult: valid ? 'Valid SSE response parsed' : 'Empty stream response',
        sample: res.text.slice(0, 120),
        error: null,
      };
    }

    if (provider.slug === 'nezuko') {
      const res = await nezukoAdapter.youtubeSearch('lofi');
      const durationMs = Date.now() - startMs;
      const count = res.data?.results?.length ?? 0;
      setProviderHealth(provider.slug, count > 0 ? 'healthy' : 'degraded');
      const ytEp = provider.endpoints.find((e) => e.id === 'ep_nezuko_yt');
      if (ytEp) {
        ytEp.lastTestedAt = new Date().toISOString();
        ytEp.lastHttpStatus = res.status;
      }
      recordGatewayLog({
        requestId,
        providerSlug: provider.slug,
        modelId: 'nezuko:yt-search',
        endpoint: res.endpoint,
        method: 'GET',
        statusCode: res.status,
        durationMs,
        success: res.ok,
      });
      return {
        connected: res.ok,
        httpStatus: res.status,
        durationMs,
        validationResult: `Validated JSON schema (${count} YouTube search results returned)`,
        sample: res.data?.results?.[0]?.title ?? null,
        error: null,
      };
    }

    if (provider.slug === 'google_gemini') {
      if (!process.env.GEMINI_API_KEY) {
        const durationMs = Date.now() - startMs;
        setProviderHealth(provider.slug, 'unavailable', 'GEMINI_API_KEY missing in Settings > Secrets');
        return {
          connected: false,
          httpStatus: 401,
          durationMs,
          validationResult: 'Skipped upstream probe: GEMINI_API_KEY not configured',
          sample: null,
          error: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
        };
      }
      const stream = await geminiAdapter.streamChat({
        model: 'gemini-4-hydrogen',
        contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
      }
      const durationMs = Date.now() - startMs;
      setProviderHealth(provider.slug, 'healthy');
      return {
        connected: true,
        httpStatus: 200,
        durationMs,
        validationResult: 'Valid Gemini SDK stream received',
        sample: text.slice(0, 120),
        error: null,
      };
    }

    // Generic HTTP HEAD/GET check for custom or AniList providers
    const resp = await fetch(provider.baseUrl, {
      method: provider.slug === 'anilist' ? 'POST' : 'GET',
      headers: provider.slug === 'anilist' ? { 'Content-Type': 'application/json' } : undefined,
      body:
        provider.slug === 'anilist'
          ? JSON.stringify({ query: 'query { Page(page:1,perPage:1){ media(type:ANIME){ id } } }' })
          : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const durationMs = Date.now() - startMs;
    const ok = resp.status >= 200 && resp.status < 400;
    setProviderHealth(provider.slug, ok ? 'healthy' : 'degraded');
    return {
      connected: ok,
      httpStatus: resp.status,
      durationMs,
      validationResult: ok ? `HTTP ${resp.status} reachable` : `HTTP ${resp.status} returned`,
      sample: null,
      error: ok ? null : `HTTP ${resp.status}`,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const classified = classifyGatewayError(err);
    setProviderHealth(provider.slug, 'unavailable', classified.message);
    recordGatewayLog({
      requestId,
      providerSlug: provider.slug,
      modelId: 'connectivity-test',
      endpoint: provider.baseUrl,
      method: 'GET',
      statusCode: classified.status || 502,
      durationMs,
      success: false,
      errorClass: classified.classification,
      errorMessage: classified.message,
    });
    return {
      connected: false,
      httpStatus: classified.status || 502,
      durationMs,
      validationResult: 'Connection failed',
      sample: null,
      error: classified.message,
    };
  }
}

export function getAutoGeneratedApiDocs() {
  const allProviders = listProviders();
  const allModels = listModels();
  return {
    generatedAt: new Date().toISOString(),
    providers: allProviders.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      baseUrl: p.baseUrl,
      apiStyle: p.apiStyle,
      authRequirements:
        p.authType === 'none'
          ? 'No upstream auth header required'
          : `Server-side ${p.authType} (never exposed to browser)`,
      capabilities: p.capabilities,
      healthStatus: p.healthStatus,
      lastCheckedAt: p.lastCheckedAt || null,
      endpoints: p.endpoints,
      models: allModels
        .filter((m) => m.providerId === p.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          modelIdentifier: m.modelIdentifier,
          capabilities: m.capabilities,
          supportedLanguages: m.supportedLanguages,
          inputTypes: m.inputTypes,
          outputTypes: m.outputTypes,
          streamingSupport: m.streamingSupport,
          verified: m.verified,
          active: m.active,
        })),
    })),
    fallbackRules: listFallbackRules(),
  };
}

export function getGatewayHealthSnapshot() {
  return {
    providers: listProviders().map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      enabled: p.enabled,
      healthStatus: p.healthStatus,
      lastCheckedAt: p.lastCheckedAt,
      lastError: p.lastError,
    })),
    circuits: getAllCircuitStates(),
    usage: getUsageStatistics(),
    recentErrors: getGatewayLogs({ errorsOnly: true, limit: 15 }),
  };
}
