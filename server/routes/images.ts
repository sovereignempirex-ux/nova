import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Type } from '@google/genai';
import { formatGeminiError, getGeminiClient } from '../gemini.ts';
import { hashIp } from '../middleware/adminAuth.ts';
import { freeAiAdapter } from '../gateway/adapters/freeAiAdapter.ts';
import { geminiAdapter } from '../gateway/adapters/geminiAdapter.ts';
import { nezukoAdapter } from '../gateway/adapters/nezukoAdapter.ts';
import { pollinationsAdapter } from '../gateway/adapters/pollinationsAdapter.ts';
import { executeGatewayCall } from '../gateway/gateway.ts';
import { listModels } from '../gateway/registry.ts';
import { checkDailyQuota, checkRateLimit } from '../gateway/reliability.ts';
import { getFreeRouterCandidates } from '../gateway/router.ts';
import { PLATFORM_CONFIG } from '../services/config.ts';
import { storeImageInSupabase, upsertSupabaseJob } from '../services/supabaseService.ts';
import { fetchValidatedImageBuffer, validatePublicHttpUrl } from '../services/urlSafety.ts';

export const imagesRouter = Router();

export interface ServerImageJob {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  imageDataUrl?: string;
  externalUrl?: string;
  supabasePath?: string;
  supabaseSignedUrl?: string;
  caption?: string;
  errorMessage?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

const ALLOWED_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
const jobs = new Map<string, ServerImageJob>();

function pruneOldJobs() {
  if (jobs.size <= 40) return;
  const oldestKey = jobs.keys().next().value;
  if (oldestKey) jobs.delete(oldestKey);
}

async function runImageJob(jobId: string, ipHash: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  // Resolve Free Auto-Router selection cleanly without ever touching paid models
  if (job.model === 'auto:free-image') {
    const candidates = getFreeRouterCandidates({ capability: 'text-to-image' });
    const routed = candidates[0];
    if (!routed) {
      job.status = 'failed';
      job.errorCode = 'NO_FREE_IMAGE_PROVIDER';
      job.errorMessage = 'No verified free image generation provider is currently available.';
      job.updatedAt = new Date().toISOString();
      return;
    }
    job.model = routed.model.id;
    job.provider = routed.providerSlug;
  }

  const endpoint =
    job.model === 'free_ai_custom:qwen7b'
      ? PLATFORM_CONFIG.freeAiEndpoint
      : job.model === 'pollinations_image:flux'
        ? pollinationsAdapter.imageBaseUrl
        : job.model === 'nezuko:flux-v1'
          ? '/api/aiimg/fulx-img-create-v1'
          : job.model === 'nezuko:monte-ai'
            ? '/api/aiimg/monte-ai-generate-image'
            : 'sdk:generateContent';

  const gw = await executeGatewayCall<{
    imageDataUrl?: string;
    externalUrl?: string;
    supabasePath?: string;
    supabaseSignedUrl?: string;
    caption?: string;
  }>({
    providerSlug: job.provider,
    modelId: job.model,
    capability: 'text-to-image',
    type: 'image',
    endpoint,
    method: job.provider === 'nezuko' || job.provider === 'pollinations_image' ? 'GET' : 'POST',
    rateLimitKey: `img:${ipHash}`,
    ipHash,
    execute: async (resolvedModelId) => {
      if (resolvedModelId === 'free_ai_custom:qwen7b') {
        const res = await freeAiAdapter.generateTextToImage({
          prompt: job.prompt,
          jobId: job.id,
          aspectRatio: job.aspectRatio,
        });
        return {
          imageDataUrl: res.imageDataUrl,
          externalUrl: res.imageUrl,
          supabasePath: res.supabasePath,
          supabaseSignedUrl: res.supabaseSignedUrl,
          caption: res.caption,
        };
      }

      if (resolvedModelId === 'pollinations_image:flux') {
        const res = await pollinationsAdapter.generateImage({
          prompt: job.prompt,
          jobId: job.id,
          aspectRatio: job.aspectRatio,
        });
        return {
          imageDataUrl: res.imageDataUrl,
          externalUrl: res.imageUrl,
          supabasePath: res.supabasePath,
          supabaseSignedUrl: res.supabaseSignedUrl,
        };
      }

      if (resolvedModelId === 'nezuko:flux-v1') {
        const res = await nezukoAdapter.fluxImage(job.prompt, job.aspectRatio);
        let imageDataUrl = res.data?.imageBase64DataUrl;
        const externalUrl = res.data?.imageUrl;
        if (!imageDataUrl && externalUrl) {
          const fetched = await fetchValidatedImageBuffer(externalUrl, PLATFORM_CONFIG.supabaseMaxBytes);
          imageDataUrl = `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`;
        }
        const supa = await storeImageInSupabase({
          base64DataUrl: imageDataUrl,
          sourceUrl: externalUrl,
          jobId: job.id,
          prompt: job.prompt,
          provider: 'nezuko',
          model: resolvedModelId,
          aspectRatio: job.aspectRatio,
        });
        return {
          imageDataUrl,
          externalUrl,
          supabasePath: supa.stored ? supa.storagePath : undefined,
          supabaseSignedUrl: supa.stored ? supa.signedUrl : undefined,
        };
      }

      if (resolvedModelId === 'nezuko:monte-ai') {
        const res = await nezukoAdapter.monteAiImage(job.prompt);
        let imageDataUrl = res.data?.imageBase64DataUrl;
        const externalUrl = res.data?.imageUrl;
        if (!imageDataUrl && externalUrl) {
          const fetched = await fetchValidatedImageBuffer(externalUrl, PLATFORM_CONFIG.supabaseMaxBytes);
          imageDataUrl = `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`;
        }
        const supa = await storeImageInSupabase({
          base64DataUrl: imageDataUrl,
          sourceUrl: externalUrl,
          jobId: job.id,
          prompt: job.prompt,
          provider: 'nezuko',
          model: resolvedModelId,
          aspectRatio: job.aspectRatio,
        });
        return {
          imageDataUrl,
          externalUrl,
          supabasePath: supa.stored ? supa.storagePath : undefined,
          supabaseSignedUrl: supa.stored ? supa.signedUrl : undefined,
        };
      }

      const response = await geminiAdapter.generateImage({
        model: resolvedModelId,
        prompt: job.prompt,
        aspectRatio: job.aspectRatio,
        imageSize: job.imageSize,
      });

      let imageDataUrl: string | undefined;
      let caption = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption += part.text;
        }
      }

      if (!imageDataUrl) {
        throw new Error(caption.trim() || 'Provider completed without returning an image payload.');
      }

      const supa = await storeImageInSupabase({
        base64DataUrl: imageDataUrl,
        jobId: job.id,
        prompt: job.prompt,
        provider: 'google_gemini',
        model: resolvedModelId,
        aspectRatio: job.aspectRatio,
      });

      return {
        imageDataUrl,
        supabasePath: supa.stored ? supa.storagePath : undefined,
        supabaseSignedUrl: supa.stored ? supa.signedUrl : undefined,
        caption: caption.trim() || undefined,
      };
    },
  });

  if (!gw.success || !gw.data || (!gw.data.imageDataUrl && !gw.data.externalUrl)) {
    job.status = 'failed';
    job.errorCode = gw.error?.code || 'NO_IMAGE_OUTPUT';
    job.errorMessage = gw.error?.message || 'Generation failed.';
    job.updatedAt = new Date().toISOString();
    void upsertSupabaseJob({
      id: job.id,
      jobType: 'image',
      status: 'failed',
      provider: job.provider,
      model: job.model,
      prompt: job.prompt,
      errorMessage: job.errorMessage,
    });
    return;
  }

  job.status = 'completed';
  job.provider = gw.provider;
  job.model = gw.model;
  job.imageDataUrl = gw.data.imageDataUrl;
  job.externalUrl = gw.data.externalUrl;
  job.supabasePath = gw.data.supabasePath;
  job.supabaseSignedUrl = gw.data.supabaseSignedUrl;
  job.caption = gw.data.caption;
  job.updatedAt = new Date().toISOString();
  void upsertSupabaseJob({
    id: job.id,
    jobType: 'image',
    status: 'completed',
    provider: job.provider,
    model: job.model,
    prompt: job.prompt,
    resultMeta: {
      aspectRatio: job.aspectRatio,
      supabasePath: job.supabasePath || null,
    },
  });
}

imagesRouter.get('/providers', (_req, res) => {
  const providers = listModels({ activeOnly: true })
    .filter((m) => m.capabilities.includes('image_generation') || m.capabilities.includes('text-to-image'))
    .map((m) => ({
      id: m.id,
      providerSlug: m.providerSlug,
      label: m.name,
      description: m.description,
      tier: m.tier,
      supportsAspect: m.id !== 'free_ai_custom:qwen7b' && m.id !== 'nezuko:monte-ai',
      verified: m.verified,
    }));
  res.json({ providers });
});

imagesRouter.get('/jobs', (_req, res) => {
  const list = Array.from(jobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  res.json({ jobs: list });
});

imagesRouter.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  res.json({ job });
});

imagesRouter.post('/generate', (req, res) => {
  const { prompt, model, aspectRatio, imageSize } = req.body as {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
  };

  if (typeof prompt !== 'string' || prompt.trim().length < 2) {
    res.status(400).json({ error: 'Please provide a descriptive image prompt (at least 2 characters).' });
    return;
  }

  const ipHash = hashIp(req.ip);
  const dailyUserCap = checkDailyQuota(`user_image:${ipHash}`, 50);
  if (!dailyUserCap.allowed) {
    res.status(429).json({ error: 'Daily free image quota (50 images/day) reached. Resets at 00:00 UTC.' });
    return;
  }

  const imageModels = listModels({ activeOnly: true }).filter(
    (m) => m.capabilities.includes('image_generation') || m.capabilities.includes('text-to-image')
  );
  const chosen =
    imageModels.find((m) => m.id === model) ||
    imageModels.find((m) => m.id === 'auto:free-image') ||
    imageModels.find((m) => m.id === 'free_ai_custom:qwen7b') ||
    imageModels[0];

  if (!chosen) {
    res.status(503).json({ error: 'No active image generation model configured in Gateway Registry.' });
    return;
  }

  const selectedRatio = aspectRatio && ALLOWED_RATIOS.has(aspectRatio) ? aspectRatio : '1:1';
  const selectedSize = imageSize === '2K' || imageSize === '4K' ? imageSize : '1K';

  const now = new Date().toISOString();
  const job: ServerImageJob = {
    id: randomUUID(),
    prompt: prompt.trim().slice(0, 2000),
    provider: chosen.providerSlug,
    model: chosen.id,
    aspectRatio: selectedRatio,
    imageSize: selectedSize,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };

  pruneOldJobs();
  jobs.set(job.id, job);

  void runImageJob(job.id, ipHash);
  res.status(202).json({ job });
});

// Nezuko Image to HD: GET /api/tools/img-to-hd?url=<url>
imagesRouter.post('/hd', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'Image URL is required.' });
    return;
  }

  const urlCheck = await validatePublicHttpUrl(url);
  if (!urlCheck.ok) {
    res.status(400).json({ error: urlCheck.reason, code: urlCheck.code });
    return;
  }

  const ipHash = hashIp(req.ip);
  const gw = await executeGatewayCall<{ imageDataUrl: string; externalUrl?: string; endpoint: string }>({
    providerSlug: 'nezuko',
    modelId: 'nezuko:img-to-hd',
    capability: 'image_enhancement',
    type: 'enhancement',
    endpoint: `/api/tools/img-to-hd?url=${encodeURIComponent(urlCheck.parsed.toString())}`,
    method: 'GET',
    rateLimitKey: `hd:${ipHash}`,
    ipHash,
    execute: async () => {
      const result = await nezukoAdapter.imageToHd(urlCheck.parsed.toString());
      if (result.data?.imageBase64DataUrl) {
        return { imageDataUrl: result.data.imageBase64DataUrl, endpoint: result.endpoint };
      }
      if (result.data?.imageUrl) {
        const fetched = await fetchValidatedImageBuffer(result.data.imageUrl, PLATFORM_CONFIG.supabaseMaxBytes);
        return {
          imageDataUrl: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
          externalUrl: fetched.finalUrl,
          endpoint: result.endpoint,
        };
      }
      throw new Error('Nezuko Image-to-HD returned no image output.');
    },
  });

  if (!gw.success || !gw.data) {
    res.status(gw.error?.status || 502).json({
      error: gw.error?.message || 'Nezuko Image-to-HD endpoint is currently unavailable.',
      endpoint: gw.metadata.endpoint,
      requestId: gw.metadata.request_id,
    });
    return;
  }

  res.json(gw.data);
});

imagesRouter.get('/proxy', async (req, res) => {
  const rl = checkRateLimit(`img_proxy:${hashIp(req.ip)}`, 120, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.` });
    return;
  }

  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing url query parameter.' });
    return;
  }
  try {
    const fetched = await fetchValidatedImageBuffer(rawUrl, PLATFORM_CONFIG.supabaseMaxBytes);
    res.setHeader('Content-Type', fetched.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(fetched.buffer);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to proxy image.' });
  }
});

imagesRouter.post('/analyze', async (req, res) => {
  const rl = checkRateLimit(`img_analyze:${hashIp(req.ip)}`, 30, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.` });
    return;
  }

  const { imageBase64, mimeType } = req.body as {
    imageBase64?: string;
    mimeType?: string;
  };

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > 8_000_000) {
    res.status(400).json({ error: 'Invalid or oversized image payload (max ~5MB).' });
    return;
  }

  const allowedMime =
    mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/png'
      ? mimeType
      : 'image/jpeg';

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: allowedMime,
              data: imageBase64,
            },
          },
          {
            text: 'Inspect this image for exposure, sharpness, noise, and color balance. Recommend practical enhancement parameters for an image enhancer tool.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            upscaleFactor: { type: Type.INTEGER, description: 'Recommended upscale multiplier: 1, 2, or 3.' },
            sharpness: { type: Type.NUMBER, description: 'Unsharp mask strength from 0 to 100.' },
            contrast: { type: Type.NUMBER, description: 'Contrast adjustment from -30 to 40.' },
            brightness: { type: Type.NUMBER, description: 'Brightness adjustment from -25 to 25.' },
            saturation: { type: Type.NUMBER, description: 'Saturation adjustment from -30 to 40.' },
            denoise: { type: Type.NUMBER, description: 'Smoothing denoise level from 0 to 50.' },
            diagnosticSummary: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence technical assessment of the image.',
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ recommendation: parsed });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
  }
});
