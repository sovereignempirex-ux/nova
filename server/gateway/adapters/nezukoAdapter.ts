import {
  nezukoDownloadMedia,
  nezukoFluxImage,
  nezukoGeminiChat,
  nezukoImageToHd,
  nezukoMonteAiImage,
  nezukoPinterestSearch,
  nezukoQwen7b,
  nezukoYoutubeSearch,
} from '../../services/nezukoService.ts';
import { withSafeRetry } from '../reliability.ts';

export const nezukoAdapter = {
  slug: 'nezuko',

  async qwen7b(params: { prompt: string; lang?: string; model?: string }) {
    return withSafeRetry(
      async () => {
        const res = await nezukoQwen7b({
          prompt: params.prompt,
          model: params.model || 'qwen7b',
          lang: params.lang || 'en',
        });
        if (!res.ok || !res.data?.reply) {
          const err = new Error(res.error || 'Nezuko Qwen 7B request failed.') as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return res;
      },
      { idempotent: true, maxRetries: 1 }
    );
  },

  async geminiChat(params: {
    prompt: string;
    lang?: string;
    imageBuffer?: Buffer;
    imageMimeType?: string;
  }) {
    // POST multipart/form-data: do NOT blindly retry non-idempotent POST
    const res = await nezukoGeminiChat(params);
    if (!res.ok || !res.data?.reply) {
      const err = new Error(res.error || 'Nezuko Gemini Chat request failed.') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res;
  },

  async fluxImage(prompt: string, aspect?: string) {
    return withSafeRetry(
      async () => {
        const res = await nezukoFluxImage(prompt, aspect);
        if (!res.ok || !res.data) {
          const err = new Error(res.error || 'Nezuko Flux image generation failed.') as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return res;
      },
      { idempotent: false }
    );
  },

  async monteAiImage(prompt: string) {
    const res = await nezukoMonteAiImage(prompt);
    if (!res.ok || !res.data) {
      const err = new Error(res.error || 'Nezuko Monte AI image generation failed.') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res;
  },

  async imageToHd(imageUrl: string) {
    const res = await nezukoImageToHd(imageUrl);
    if (!res.ok || !res.data) {
      const err = new Error(res.error || 'Nezuko Image-to-HD failed.') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res;
  },

  async youtubeSearch(q: string) {
    return withSafeRetry(
      async () => {
        const res = await nezukoYoutubeSearch(q);
        if (!res.ok || !res.data) {
          const err = new Error(res.error || 'Nezuko YouTube search failed.') as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return res;
      },
      { idempotent: true, maxRetries: 1 }
    );
  },

  async pinterestSearch(q: string) {
    return withSafeRetry(
      async () => {
        const res = await nezukoPinterestSearch(q);
        if (!res.ok || !res.data) {
          const err = new Error(res.error || 'Nezuko Pinterest search failed.') as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return res;
      },
      { idempotent: true, maxRetries: 1 }
    );
  },

  async downloadMedia(url: string) {
    return withSafeRetry(
      async () => {
        const res = await nezukoDownloadMedia(url);
        if (!res.ok || !res.data) {
          const err = new Error(res.error || 'Nezuko Media Downloader failed.') as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return res;
      },
      { idempotent: true, maxRetries: 1 }
    );
  },
};
