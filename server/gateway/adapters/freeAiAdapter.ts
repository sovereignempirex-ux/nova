import {
  FreeAiStreamHandlers,
  generateFreeAiImage,
  streamFreeAiChat,
} from '../../services/freeAiService.ts';
import { PLATFORM_CONFIG } from '../../services/config.ts';
import { storeImageInSupabase } from '../../services/supabaseService.ts';
import { fetchValidatedImageBuffer, validatePublicHttpUrl } from '../../services/urlSafety.ts';

export const freeAiAdapter = {
  slug: 'free_ai_custom',

  async streamChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    handlers: FreeAiStreamHandlers
  ) {
    return streamFreeAiChat(messages, handlers);
  },

  async generateTextToImage(params: {
    prompt: string;
    jobId: string;
    aspectRatio: string;
  }) {
    const result = await generateFreeAiImage(params.prompt);
    const urlCheck = await validatePublicHttpUrl(result.imageUrl);
    if (!urlCheck.ok) {
      throw new Error(urlCheck.reason);
    }

    const fetched = await fetchValidatedImageBuffer(
      result.imageUrl,
      PLATFORM_CONFIG.supabaseMaxBytes
    );
    const imageDataUrl = `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`;

    const supa = await storeImageInSupabase({
      base64DataUrl: imageDataUrl,
      sourceUrl: result.imageUrl,
      jobId: params.jobId,
      prompt: params.prompt,
      provider: 'free_ai_custom',
      model: 'free_ai_custom:qwen7b',
      aspectRatio: params.aspectRatio,
    });

    return {
      imageUrl: result.imageUrl,
      imageDataUrl,
      caption: result.caption,
      shareUrl: result.shareUrl,
      upstreamModel: result.upstreamModel,
      supabasePath: supa.stored ? supa.storagePath : undefined,
      supabaseSignedUrl: supa.stored ? supa.signedUrl : undefined,
      supabaseError: supa.stored ? undefined : supa.error,
    };
  },
};
