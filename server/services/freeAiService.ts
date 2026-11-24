import { PLATFORM_CONFIG } from './config.ts';

export interface FreeAiToolImageResult {
  type: string;
  url: string;
  cost?: number;
  model?: string;
  shareToken?: string;
  shareUrl?: string;
}

export interface FreeAiStreamHandlers {
  onDelta: (text: string) => void;
  onImage: (img: FreeAiToolImageResult) => void;
}

export async function streamFreeAiChat(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  handlers: FreeAiStreamHandlers
): Promise<{ text: string; image?: FreeAiToolImageResult }> {
  const resp = await fetch(PLATFORM_CONFIG.freeAiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': 'NOVA-Platform/1.0',
    },
    body: JSON.stringify({
      messages,
      model: PLATFORM_CONFIG.freeAiModelId,
      stream: true,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '');
    throw new Error(errText.slice(0, 300) || `Free AI Custom returned HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let generatedImage: FreeAiToolImageResult | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr) as {
          tool_result?: {
            type?: string;
            url?: string;
            cost?: number;
            model?: string;
            share_token?: string;
            share_url?: string;
          };
          choices?: Array<{
            delta?: { content?: string };
          }>;
          error?: { message?: string } | string;
        };

        if (parsed.error) {
          const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
          throw new Error(msg || 'Free AI upstream stream error');
        }

        if (parsed.tool_result?.type === 'image' && parsed.tool_result.url) {
          generatedImage = {
            type: parsed.tool_result.type,
            url: parsed.tool_result.url,
            cost: parsed.tool_result.cost,
            model: parsed.tool_result.model,
            shareToken: parsed.tool_result.share_token,
            shareUrl: parsed.tool_result.share_url,
          };
          handlers.onImage(generatedImage);
        }

        const deltaText = parsed.choices?.[0]?.delta?.content;
        if (typeof deltaText === 'string' && deltaText.length > 0) {
          fullText += deltaText;
          handlers.onDelta(deltaText);
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message.includes('Free AI upstream')) {
          throw parseErr;
        }
      }
    }
  }

  return { text: fullText, image: generatedImage };
}

export async function generateFreeAiImage(prompt: string): Promise<{
  imageUrl: string;
  caption: string;
  shareUrl?: string;
  upstreamModel?: string;
}> {
  const result = await streamFreeAiChat(
    [
      {
        role: 'user',
        content: `Generate an image of: ${prompt}`,
      },
    ],
    {
      onDelta: () => {},
      onImage: () => {},
    }
  );

  if (!result.image?.url) {
    throw new Error(
      result.text.trim() || 'Free AI Custom completed without returning an image URL.'
    );
  }

  return {
    imageUrl: result.image.url,
    caption: result.text.trim(),
    shareUrl: result.image.shareUrl,
    upstreamModel: result.image.model,
  };
}
