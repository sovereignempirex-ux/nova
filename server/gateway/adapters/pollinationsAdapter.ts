import { PLATFORM_CONFIG } from '../../services/config.ts';
import { storeImageInSupabase } from '../../services/supabaseService.ts';
import { getProviderCooldownRemainingSec, setProviderCooldown } from '../reliability.ts';

export interface PollinationsStreamHandlers {
  onDelta: (text: string) => void;
}

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 768, height: 768 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 896, height: 672 },
  '3:4': { width: 672, height: 896 },
};

export const pollinationsAdapter = {
  textEndpoint: 'https://text.pollinations.ai/openai',
  imageBaseUrl: 'https://image.pollinations.ai/prompt',

  async streamTextChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    handlers: PollinationsStreamHandlers
  ): Promise<{ text: string; modelUsed: string }> {
    const resp = await fetch(this.textEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: 'openai',
        stream: true,
        messages,
      }),
      signal: AbortSignal.timeout(PLATFORM_CONFIG.requestTimeoutMs),
    });

    if (!resp.ok) {
      const bodyTxt = await resp.text().catch(() => '');
      const err = new Error(
        `Pollinations Text returned HTTP ${resp.status}: ${bodyTxt.slice(0, 180) || resp.statusText}`
      ) as Error & { status?: number };
      err.status = resp.status;
      throw err;
    }

    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      const text = await resp.text();
      if (!text.trim()) throw new Error('Pollinations Text returned empty body.');
      handlers.onDelta(text);
      return { text, modelUsed: 'openai' };
    }

    if (!resp.body) {
      throw new Error('Pollinations Text returned empty stream body.');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let modelUsed = 'openai';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as {
            model?: string;
            choices?: Array<{ delta?: { content?: string } }>;
          };
          if (parsed.model) modelUsed = parsed.model;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            accumulated += delta;
            handlers.onDelta(delta);
          }
        } catch {
          // Ignore malformed SSE frame
        }
      }
    }

    if (!accumulated.trim()) {
      throw new Error('Pollinations Text SSE stream ended with empty assistant output.');
    }

    return { text: accumulated, modelUsed };
  },

  async generateImage(params: {
    prompt: string;
    jobId: string;
    aspectRatio: string;
  }) {
    const cooldownSec = getProviderCooldownRemainingSec('pollinations_image');
    if (cooldownSec > 0) {
      const err = new Error(
        `Pollinations Image free IP cooldown active. Retry after ${cooldownSec}s (upstream enforces 1 image / 45s per IP).`
      ) as Error & { status?: number };
      err.status = 429;
      throw err;
    }

    const dims = ASPECT_DIMENSIONS[params.aspectRatio] || ASPECT_DIMENSIONS['1:1'];
    const seed = Math.floor(Math.random() * 999999) + 1;
    const targetUrl = `${this.imageBaseUrl}/${encodeURIComponent(params.prompt)}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}`;

    const resp = await fetch(targetUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(35_000),
    });

    if (resp.status === 402 || resp.status === 429) {
      setProviderCooldown('pollinations_image', 45);
      const errJson = await resp.text().catch(() => '');
      const err = new Error(
        `Pollinations Image rate limited (${resp.status}): ${errJson.slice(0, 180) || '1 image every 45 seconds per IP'}`
      ) as Error & { status?: number };
      err.status = 429;
      throw err;
    }

    if (!resp.ok) {
      const err = new Error(`Pollinations Image failed with HTTP ${resp.status}.`) as Error & { status?: number };
      err.status = resp.status;
      throw err;
    }

    const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) {
      throw new Error(`Pollinations Image returned unexpected content-type "${ct}".`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1024) {
      throw new Error('Pollinations Image returned an invalid/truncated image buffer.');
    }

    // Record 45s cooldown after every uncached generation so we don't trigger upstream 402s
    setProviderCooldown('pollinations_image', 45);

    const imageDataUrl = `data:${ct};base64,${buffer.toString('base64')}`;
    const supa = await storeImageInSupabase({
      base64DataUrl: imageDataUrl,
      sourceUrl: targetUrl,
      jobId: params.jobId,
      prompt: params.prompt,
      provider: 'pollinations_image',
      model: 'pollinations_image:flux',
      aspectRatio: params.aspectRatio,
    });

    return {
      imageUrl: targetUrl,
      imageDataUrl,
      supabasePath: supa.stored ? supa.storagePath : undefined,
      supabaseSignedUrl: supa.stored ? supa.signedUrl : undefined,
    };
  },
};
