import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ThinkingLevel } from '@google/genai';
import { formatGeminiError } from '../gemini.ts';
import { hashIp } from '../middleware/adminAuth.ts';
import { freeAiAdapter } from '../gateway/adapters/freeAiAdapter.ts';
import { geminiAdapter } from '../gateway/adapters/geminiAdapter.ts';
import { nezukoAdapter } from '../gateway/adapters/nezukoAdapter.ts';
import { runCloudflareWorkersAiChat, streamOpenAiCompatibleChat } from '../gateway/adapters/openAiCompatAdapter.ts';
import { pollinationsAdapter } from '../gateway/adapters/pollinationsAdapter.ts';
import { executeGatewayCall } from '../gateway/gateway.ts';
import { getModelById, listModels, setProviderHealth } from '../gateway/registry.ts';
import {
  canExecuteCircuit,
  checkDailyQuota,
  checkRateLimit,
  classifyGatewayError,
  recordCircuitFailure,
  recordCircuitSuccess,
  recordGatewayLog,
} from '../gateway/reliability.ts';
import { getFreeRouterCandidates } from '../gateway/router.ts';
import { normalizeLang, PLATFORM_CONFIG } from '../services/config.ts';
import { validatePublicHttpUrl } from '../services/urlSafety.ts';

export const chatRouter = Router();

interface ChatTurnInput {
  role: 'user' | 'model';
  content: string;
}

function resolveThinkingLevel(level: string | undefined, model: string): ThinkingLevel | undefined {
  if (!level) return undefined;
  const upper = level.toUpperCase();
  if (upper === 'LOW') return ThinkingLevel.LOW;
  if (upper === 'MEDIUM') return ThinkingLevel.MEDIUM;
  if (upper === 'HIGH') return ThinkingLevel.HIGH;
  if (upper === 'MINIMAL' && model === 'gemini-3.1-flash-lite') return ThinkingLevel.MINIMAL;
  return undefined;
}

chatRouter.get('/models', (_req, res) => {
  const models = listModels({ activeOnly: true })
    .filter((m) => m.capabilities.includes('text_generation') || m.capabilities.includes('image_understanding'))
    .map((m) => ({
      id: m.id,
      provider: m.providerSlug,
      label: m.name,
      description: m.description,
      tier: m.tier,
      supportsThinking: Boolean((m.configSchema as { thinkingLevel?: unknown }).thinkingLevel),
      supportsImageInput: m.inputTypes.includes('image'),
      supportsImageOutput: m.outputTypes.includes('image'),
      supportsStreaming: m.streamingSupport,
      supportedLanguages: m.supportedLanguages,
      verified: m.verified,
    }));

  res.json({
    models,
    config: {
      freeAiProviderSlug: PLATFORM_CONFIG.freeAiProviderSlug,
      freeAiModelId: PLATFORM_CONFIG.freeAiModelId,
      freeAiApiStyle: PLATFORM_CONFIG.freeAiApiStyle,
      nezukoBaseUrl: PLATFORM_CONFIG.nezukoBaseUrl,
    },
  });
});

async function executeSingleChatModel(params: {
  selectedModel: string;
  cleanedMessages: Array<{ role: 'user' | 'model'; content: string }>;
  systemInstruction?: string;
  thinkingLevel?: string;
  resolvedLang: 'en' | 'ar';
  imageBase64?: string;
  imageMimeType?: string;
  ipHash: string;
  requestId: string;
  onDelta: (text: string) => void;
  onImage: (payload: { url: string; originalUrl: string; shareUrl?: string; model?: string }) => void;
}): Promise<{ providerSlug: string; endpoint: string }> {
  const {
    selectedModel,
    cleanedMessages,
    systemInstruction,
    thinkingLevel,
    resolvedLang,
    imageBase64,
    imageMimeType,
    ipHash,
    onDelta,
    onImage,
  } = params;

  const latestUserPrompt = cleanedMessages[cleanedMessages.length - 1].content;
  const apiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  if (typeof systemInstruction === 'string' && systemInstruction.trim().length > 0) {
    apiMessages.push({ role: 'system', content: systemInstruction.trim().slice(0, 1500) });
  }
  for (const m of cleanedMessages) {
    apiMessages.push({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.content,
    });
  }

  // 1. Free AI Custom SSE Chat + Image
  if (selectedModel === 'free_ai_custom:qwen7b') {
    if (!canExecuteCircuit('free_ai_custom')) {
      throw new Error('Free AI Custom circuit breaker is temporarily open.');
    }

    const pendingImageChecks: Promise<void>[] = [];
    await freeAiAdapter.streamChat(apiMessages, {
      onDelta,
      onImage: (img) => {
        const checkPromise = (async () => {
          try {
            const urlCheck = await validatePublicHttpUrl(img.url);
            if (urlCheck.ok) {
              onImage({
                url: `/api/images/proxy?url=${encodeURIComponent(img.url)}`,
                originalUrl: img.url,
                shareUrl: img.shareUrl,
                model: img.model,
              });
            }
          } catch {
            // Ignore failed URL validation so stream finishes cleanly
          }
        })();
        pendingImageChecks.push(checkPromise);
      },
    });
    await Promise.all(pendingImageChecks);
    recordCircuitSuccess('free_ai_custom');
    setProviderHealth('free_ai_custom', 'healthy', undefined, 'Working');
    return { providerSlug: 'free_ai_custom', endpoint: PLATFORM_CONFIG.freeAiEndpoint };
  }

  // 2. Pollinations Anonymous Text SSE
  if (selectedModel === 'pollinations_text:openai') {
    if (!canExecuteCircuit('pollinations_text')) {
      throw new Error('Pollinations Text circuit breaker is temporarily open.');
    }
    await pollinationsAdapter.streamTextChat(apiMessages, { onDelta });
    recordCircuitSuccess('pollinations_text');
    setProviderHealth('pollinations_text', 'healthy', undefined, 'Working');
    return { providerSlug: 'pollinations_text', endpoint: pollinationsAdapter.textEndpoint };
  }

  // 3. Groq Free Tier SSE (requires GROQ_API_KEY)
  if (selectedModel === 'groq:llama-3.3-70b-versatile') {
    const quota = checkDailyQuota('provider:groq', 1000);
    if (!quota.allowed) throw new Error('Groq daily free quota reached (1,000 RPD).');
    await streamOpenAiCompatibleChat(
      {
        providerSlug: 'groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKeyEnvVar: 'GROQ_API_KEY',
        model: 'llama-3.3-70b-versatile',
      },
      apiMessages,
      onDelta
    );
    recordCircuitSuccess('groq');
    setProviderHealth('groq', 'healthy', undefined, 'Working');
    return { providerSlug: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions' };
  }

  // 4. OpenRouter Free Models Router (requires OPENROUTER_API_KEY)
  if (selectedModel === 'openrouter:free') {
    const quota = checkDailyQuota('provider:openrouter_free', 50);
    if (!quota.allowed) throw new Error('OpenRouter free daily limit reached (50 RPD).');
    await streamOpenAiCompatibleChat(
      {
        providerSlug: 'openrouter_free',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKeyEnvVar: 'OPENROUTER_API_KEY',
        model: 'openrouter/free',
        extraHeaders: { 'HTTP-Referer': 'https://nova.vanitasbot.my.id', 'X-Title': 'NOVA' },
      },
      apiMessages,
      onDelta
    );
    recordCircuitSuccess('openrouter_free');
    setProviderHealth('openrouter_free', 'healthy', undefined, 'Working');
    return { providerSlug: 'openrouter_free', endpoint: 'https://openrouter.ai/api/v1/chat/completions' };
  }

  // 5. Cloudflare Workers AI (requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)
  if (selectedModel === 'cloudflare:llama-3.1-8b') {
    const quota = checkDailyQuota('provider:cloudflare_workers_ai', 300);
    if (!quota.allowed) throw new Error('Cloudflare Workers AI daily protection limit reached.');
    const cfRes = await runCloudflareWorkersAiChat('@cf/meta/llama-3.1-8b-instruct', apiMessages);
    onDelta(cfRes.text);
    recordCircuitSuccess('cloudflare_workers_ai');
    setProviderHealth('cloudflare_workers_ai', 'healthy', undefined, 'Working');
    return { providerSlug: 'cloudflare_workers_ai', endpoint: 'cloudflare:@cf/meta/llama-3.1-8b-instruct' };
  }

  // 6. Hugging Face Inference Router (requires HF_TOKEN)
  if (selectedModel === 'huggingface:qwen2.5-7b') {
    const quota = checkDailyQuota('provider:huggingface_inference', 100);
    if (!quota.allowed) throw new Error('Hugging Face daily free budget guard reached.');
    await streamOpenAiCompatibleChat(
      {
        providerSlug: 'huggingface_inference',
        endpoint: 'https://router.huggingface.co/v1/chat/completions',
        apiKeyEnvVar: 'HF_TOKEN',
        model: 'Qwen/Qwen2.5-7B-Instruct',
      },
      apiMessages,
      onDelta
    );
    recordCircuitSuccess('huggingface_inference');
    setProviderHealth('huggingface_inference', 'healthy', undefined, 'Working');
    return { providerSlug: 'huggingface_inference', endpoint: 'https://router.huggingface.co/v1/chat/completions' };
  }

  // 7. Nezuko Gemini Chat (multipart/form-data) routed via Gateway
  if (selectedModel === 'nezuko:gemini-chat') {
    let imageBuffer: Buffer | undefined;
    if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
      if (imageBase64.length > 10_000_000) {
        throw new Error('Attached image exceeds maximum allowed upload size.');
      }
      imageBuffer = Buffer.from(imageBase64, 'base64');
    }

    const gw = await executeGatewayCall({
      providerSlug: 'nezuko',
      modelId: 'nezuko:gemini-chat',
      capability: imageBuffer ? 'image_understanding' : 'text_generation',
      type: 'text',
      endpoint: '/api/ai/gemini-chat',
      method: 'POST',
      rateLimitKey: `nezuko:${ipHash}`,
      ipHash,
      requiresImageInput: Boolean(imageBuffer),
      execute: async () => {
        const resData = await nezukoAdapter.geminiChat({
          prompt: latestUserPrompt,
          lang: resolvedLang,
          imageBuffer,
          imageMimeType: imageMimeType || 'image/jpeg',
        });
        return resData.data?.reply || '';
      },
    });

    if (!gw.success || !gw.data) {
      throw new Error(gw.error?.message || 'Nezuko Gemini Chat failed.');
    }

    onDelta(gw.data);
    return { providerSlug: 'nezuko', endpoint: '/api/ai/gemini-chat' };
  }

  // 8. Nezuko Qwen 7B routed via Gateway
  if (selectedModel === 'nezuko:qwen-7b') {
    const gw = await executeGatewayCall({
      providerSlug: 'nezuko',
      modelId: 'nezuko:qwen-7b',
      capability: 'text_generation',
      type: 'text',
      endpoint: '/api/ai/Qwen-7B',
      method: 'GET',
      rateLimitKey: `nezuko:${ipHash}`,
      ipHash,
      execute: async (resolvedModelId) => {
        if (resolvedModelId === 'pollinations_text:openai') {
          const fb = await pollinationsAdapter.streamTextChat(
            [{ role: 'user', content: latestUserPrompt }],
            { onDelta: () => {} }
          );
          return fb.text;
        }
        if (resolvedModelId === 'free_ai_custom:qwen7b') {
          const fb = await freeAiAdapter.streamChat(
            [{ role: 'user', content: latestUserPrompt }],
            { onDelta: () => {}, onImage: () => {} }
          );
          return fb.text;
        }
        const resData = await nezukoAdapter.qwen7b({
          prompt: latestUserPrompt,
          model: 'qwen7b',
          lang: resolvedLang,
        });
        return resData.data?.reply || '';
      },
    });

    if (!gw.success || !gw.data) {
      throw new Error(gw.error?.message || 'Nezuko Qwen 7B failed.');
    }

    onDelta(gw.data);
    return { providerSlug: gw.provider, endpoint: '/api/ai/Qwen-7B' };
  }

  // 9. Google Gemini SDK (server-side)
  if (!canExecuteCircuit('google_gemini')) {
    throw new Error('Google Gemini circuit breaker is temporarily open.');
  }

  const resolvedThinking = resolveThinkingLevel(thinkingLevel, selectedModel);
  const contents = cleanedMessages.map((m, idx) => {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (
      idx === cleanedMessages.length - 1 &&
      m.role === 'user' &&
      typeof imageBase64 === 'string' &&
      imageBase64.length > 0 &&
      imageBase64.length <= 10_000_000
    ) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType === 'image/png' || imageMimeType === 'image/webp' ? imageMimeType : 'image/jpeg',
          data: imageBase64,
        },
      });
    }
    parts.push({ text: m.content });
    return { role: m.role, parts };
  });

  const stream = await geminiAdapter.streamChat({
    model: selectedModel,
    contents,
    systemInstruction:
      typeof systemInstruction === 'string' && systemInstruction.trim().length > 0
        ? systemInstruction.trim().slice(0, 2000)
        : undefined,
    thinkingLevel: resolvedThinking,
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      onDelta(text);
    }
  }

  recordCircuitSuccess('google_gemini');
  setProviderHealth('google_gemini', 'healthy', undefined, 'Working');
  return { providerSlug: 'google_gemini', endpoint: 'sdk:generateContentStream' };
}

chatRouter.post('/stream', async (req, res) => {
  const { model, messages, systemInstruction, thinkingLevel, lang, imageBase64, imageMimeType } = req.body as {
    model?: string;
    messages?: ChatTurnInput[];
    systemInstruction?: string;
    thinkingLevel?: string;
    lang?: string;
    imageBase64?: string;
    imageMimeType?: string;
  };

  const ipHash = hashIp(req.ip);
  const rl = checkRateLimit(`chat:${ipHash}`, 60, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.` });
    return;
  }

  const dailyUserCap = checkDailyQuota(`user_chat:${ipHash}`, 250);
  if (!dailyUserCap.allowed) {
    res.status(429).json({ error: 'Daily free chat quota (250 messages/day) reached. Resets at 00:00 UTC.' });
    return;
  }

  const candidateModel = model ? getModelById(model) : getModelById('auto:free-chat');
  const selectedModel = candidateModel && candidateModel.active ? candidateModel.id : 'auto:free-chat';
  const resolvedLang = normalizeLang(lang, 'en');

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'At least one message is required.' });
    return;
  }

  const cleanedMessages = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-30)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 32000),
    }));

  if (cleanedMessages.length === 0) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }

  const requestId = `req_${randomUUID().slice(0, 12)}`;
  const startMs = Date.now();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    if (selectedModel === 'auto:free-chat') {
      const candidates = getFreeRouterCandidates({
        capability: imageBase64 ? 'image_understanding' : 'text_generation',
        lang: resolvedLang,
        requiresImageInput: Boolean(imageBase64),
      });
      if (candidates.length === 0) {
        throw new Error('No verified free AI chat provider is currently available.');
      }

      let lastErr: unknown;
      for (const candidate of candidates) {
        let emittedAnyDelta = false;
        try {
          const exec = await executeSingleChatModel({
            selectedModel: candidate.model.id,
            cleanedMessages,
            systemInstruction,
            thinkingLevel,
            resolvedLang,
            imageBase64,
            imageMimeType,
            ipHash,
            requestId,
            onDelta: (t) => {
              emittedAnyDelta = true;
              res.write(`data: ${JSON.stringify({ type: 'delta', text: t })}\n\n`);
            },
            onImage: (img) => {
              emittedAnyDelta = true;
              res.write(`data: ${JSON.stringify({ type: 'image', ...img })}\n\n`);
            },
          });

          recordGatewayLog({
            requestId,
            providerSlug: exec.providerSlug,
            modelId: candidate.model.id,
            endpoint: exec.endpoint,
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startMs,
            success: true,
            ipHash,
            meta: { routedVia: 'auto:free-chat', score: candidate.score },
          });
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
          return;
        } catch (err) {
          lastErr = err;
          recordCircuitFailure(candidate.providerSlug);
          if (emittedAnyDelta) {
            throw err;
          }
        }
      }
      throw lastErr || new Error('All free chat providers failed.');
    }

    const exec = await executeSingleChatModel({
      selectedModel,
      cleanedMessages,
      systemInstruction,
      thinkingLevel,
      resolvedLang,
      imageBase64,
      imageMimeType,
      ipHash,
      requestId,
      onDelta: (text) => res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`),
      onImage: (img) => res.write(`data: ${JSON.stringify({ type: 'image', ...img })}\n\n`),
    });

    recordGatewayLog({
      requestId,
      providerSlug: exec.providerSlug,
      modelId: selectedModel,
      endpoint: exec.endpoint,
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - startMs,
      success: true,
      ipHash,
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    const formatted = formatGeminiError(err);
    const providerSlug = getModelById(selectedModel)?.providerSlug || 'nova_router';
    const classified = classifyGatewayError(err, formatted.status);
    recordCircuitFailure(providerSlug);
    setProviderHealth(
      providerSlug,
      'degraded',
      formatted.message,
      classified.classification === 'UPSTREAM_RATE_LIMIT' ? 'Rate limited' : 'Degraded'
    );
    recordGatewayLog({
      requestId,
      providerSlug,
      modelId: selectedModel,
      endpoint: '/api/chat/stream',
      method: 'POST',
      statusCode: formatted.status,
      durationMs: Date.now() - startMs,
      success: false,
      errorClass: classified.classification,
      errorMessage: formatted.message,
      ipHash,
    });
    res.write(`data: ${JSON.stringify({ type: 'error', code: formatted.code, message: formatted.message })}\n\n`);
    res.end();
  }
});
