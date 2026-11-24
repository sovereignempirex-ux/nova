import { PLATFORM_CONFIG, normalizeLang } from './config.ts';

export interface NezukoResult<T> {
  ok: boolean;
  status: number;
  endpoint: string;
  data?: T;
  error?: string;
}

export interface NezukoYoutubeVideo {
  title: string;
  url: string;
  duration?: string;
  seconds?: number;
  views?: number;
  published_ago?: string;
  thumbnail?: string;
  author?: { name?: string; url?: string };
}

export interface NezukoYoutubeResponse {
  success: boolean;
  search_engine?: string;
  results_count?: number;
  main_result?: NezukoYoutubeVideo;
  results?: NezukoYoutubeVideo[];
  error?: string;
}

export interface NezukoPinterestPin {
  pin_id: string;
  title?: string;
  image_url?: string;
  created_at?: string;
  stats?: { repin_count?: number; comment_count?: number };
  publisher?: { name?: string; username?: string; profile_url?: string; avatar?: string };
}

export interface NezukoPinterestResponse {
  success: boolean;
  search_engine?: string;
  results_count?: number;
  results?: NezukoPinterestPin[];
  error?: string;
}

export interface NezukoChatResponse {
  success: boolean;
  reply?: string;
  model?: string | null;
  conversation_id?: string;
  elapsed_ms?: number;
  error?: string;
  details?: string;
}

export interface NezukoImagePayload {
  imageUrl?: string;
  imageBase64DataUrl?: string;
  raw?: unknown;
}

async function fetchNezuko(
  pathWithQuery: string,
  init: RequestInit = {}
): Promise<{ status: number; contentType: string; json?: Record<string, unknown>; buffer?: Buffer; text?: string }> {
  const url = `${PLATFORM_CONFIG.nezukoBaseUrl}${pathWithQuery}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'NOVA-Platform/1.0',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(PLATFORM_CONFIG.requestTimeoutMs),
  });

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('image/')) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { status: resp.status, contentType, buffer };
  }

  const text = await resp.text();
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return { status: resp.status, contentType, json, text };
  } catch {
    return { status: resp.status, contentType, text };
  }
}

function extractErrorMessage(res: { status: number; json?: Record<string, unknown>; text?: string }): string {
  if (res.json) {
    const err = res.json.error;
    const details = res.json.details;
    const debug = res.json.debug as Record<string, unknown> | undefined;
    const debugMsg = debug?.message || debug?.messages;
    const parts = [err, details, debugMsg].filter((v) => typeof v === 'string' && v.trim().length > 0);
    if (parts.length > 0) return parts.join(' — ');
  }
  return res.text?.slice(0, 300) || `Nezuko API returned HTTP ${res.status}`;
}

function extractImageUrlFromJson(obj: Record<string, unknown>): string | undefined {
  const candidates = [
    obj.url,
    obj.image,
    obj.image_url,
    obj.imageUrl,
    obj.result,
    obj.output,
    (obj.data as Record<string, unknown> | undefined)?.url,
    (obj.data as Record<string, unknown> | undefined)?.image,
    (obj.data as Record<string, unknown> | undefined)?.image_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) {
      return c;
    }
  }
  return undefined;
}

// 1. Image to HD: GET /api/tools/img-to-hd?url=<url>
export async function nezukoImageToHd(imageUrl: string): Promise<NezukoResult<NezukoImagePayload>> {
  const endpoint = `/api/tools/img-to-hd?url=${encodeURIComponent(imageUrl)}`;
  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300) {
      if (res.buffer) {
        const mime = res.contentType.split(';')[0] || 'image/png';
        return {
          ok: true,
          status: res.status,
          endpoint,
          data: { imageBase64DataUrl: `data:${mime};base64,${res.buffer.toString('base64')}` },
        };
      }
      if (res.json && res.json.success !== false) {
        const url = extractImageUrlFromJson(res.json);
        if (url) {
          return { ok: true, status: res.status, endpoint, data: { imageUrl: url, raw: res.json } };
        }
      }
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Image-to-HD request timed out.',
    };
  }
}

// 2. YouTube Search: GET /api/search/yt-search?q=<q>
export async function nezukoYoutubeSearch(q: string): Promise<NezukoResult<NezukoYoutubeResponse>> {
  const endpoint = `/api/search/yt-search?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300 && res.json && res.json.success) {
      return { ok: true, status: res.status, endpoint, data: res.json as unknown as NezukoYoutubeResponse };
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko YouTube Search failed.',
    };
  }
}

// 3. Pinterest Search: GET /api/search/pinterest-search?q=<q>
export async function nezukoPinterestSearch(q: string): Promise<NezukoResult<NezukoPinterestResponse>> {
  const endpoint = `/api/search/pinterest-search?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300 && res.json && res.json.success) {
      return { ok: true, status: res.status, endpoint, data: res.json as unknown as NezukoPinterestResponse };
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Pinterest Search failed.',
    };
  }
}

// 4. Media Downloader: GET /api/download/all-download-media?url=<url>
export async function nezukoDownloadMedia(mediaUrl: string): Promise<NezukoResult<Record<string, unknown>>> {
  const endpoint = `/api/download/all-download-media?url=${encodeURIComponent(mediaUrl)}`;
  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300 && res.json && res.json.success !== false) {
      return { ok: true, status: res.status, endpoint, data: res.json };
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Media Downloader request failed.',
    };
  }
}

// 5. Flux Image Creation: GET /api/aiimg/fulx-img-create-v1?prompt=<prompt>&aspect=<aspect>
export async function nezukoFluxImage(
  prompt: string,
  aspect?: string
): Promise<NezukoResult<NezukoImagePayload>> {
  // Map UI aspect ratios to Nezuko Flux accepted aspect words
  const aspectMap: Record<string, string> = {
    '1:1': 'square',
    '16:9': 'landscape',
    '4:3': 'landscape',
    '9:16': 'portrait',
    '3:4': 'portrait',
    square: 'square',
    landscape: 'landscape',
    portrait: 'portrait',
  };
  const mappedAspect = aspect && aspectMap[aspect] ? aspectMap[aspect] : 'square';
  const endpoint = `/api/aiimg/fulx-img-create-v1?prompt=${encodeURIComponent(prompt)}&aspect=${encodeURIComponent(mappedAspect)}`;

  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300) {
      if (res.buffer) {
        const mime = res.contentType.split(';')[0] || 'image/png';
        return {
          ok: true,
          status: res.status,
          endpoint,
          data: { imageBase64DataUrl: `data:${mime};base64,${res.buffer.toString('base64')}` },
        };
      }
      if (res.json && res.json.success !== false) {
        const url = extractImageUrlFromJson(res.json);
        if (url) {
          return { ok: true, status: res.status, endpoint, data: { imageUrl: url, raw: res.json } };
        }
      }
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Flux image request timed out.',
    };
  }
}

// 6. Monte AI Image Generation: GET /api/aiimg/monte-ai-generate-image?prompt=<prompt>
export async function nezukoMonteAiImage(prompt: string): Promise<NezukoResult<NezukoImagePayload>> {
  const endpoint = `/api/aiimg/monte-ai-generate-image?prompt=${encodeURIComponent(prompt)}`;
  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300) {
      if (res.buffer) {
        const mime = res.contentType.split(';')[0] || 'image/png';
        return {
          ok: true,
          status: res.status,
          endpoint,
          data: { imageBase64DataUrl: `data:${mime};base64,${res.buffer.toString('base64')}` },
        };
      }
      if (res.json && res.json.success !== false) {
        const url = extractImageUrlFromJson(res.json);
        if (url) {
          return { ok: true, status: res.status, endpoint, data: { imageUrl: url, raw: res.json } };
        }
      }
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Monte AI image request timed out.',
    };
  }
}

// 7. Gemini Chat: POST /api/ai/gemini-chat (multipart/form-data: prompt, lang, image?)
export async function nezukoGeminiChat(params: {
  prompt: string;
  lang?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  imageFilename?: string;
}): Promise<NezukoResult<NezukoChatResponse>> {
  const endpoint = '/api/ai/gemini-chat';
  const lang = normalizeLang(params.lang, 'en');
  const form = new FormData();
  form.append('prompt', params.prompt);
  form.append('lang', lang);

  if (params.imageBuffer && params.imageBuffer.length > 0) {
    const mime = params.imageMimeType || 'image/jpeg';
    const blob = new Blob([new Uint8Array(params.imageBuffer)], { type: mime });
    form.append('image', blob, params.imageFilename || 'upload.jpg');
  }

  try {
    const res = await fetchNezuko(endpoint, {
      method: 'POST',
      body: form,
    });
    if (res.status >= 200 && res.status < 300 && res.json && res.json.success) {
      return { ok: true, status: res.status, endpoint, data: res.json as unknown as NezukoChatResponse };
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Gemini Chat request failed.',
    };
  }
}

// 8. Qwen 7B: GET /api/ai/Qwen-7B?prompt=<prompt>&model=<model>&lang=<lang>
export async function nezukoQwen7b(params: {
  prompt: string;
  model?: string;
  lang?: string;
}): Promise<NezukoResult<NezukoChatResponse>> {
  const lang = normalizeLang(params.lang, 'en');
  const model = params.model || 'qwen7b';
  const endpoint = `/api/ai/Qwen-7B?prompt=${encodeURIComponent(params.prompt)}&model=${encodeURIComponent(model)}&lang=${encodeURIComponent(lang)}`;

  try {
    const res = await fetchNezuko(endpoint);
    if (res.status >= 200 && res.status < 300 && res.json && res.json.success) {
      return { ok: true, status: res.status, endpoint, data: res.json as unknown as NezukoChatResponse };
    }
    return { ok: false, status: res.status, endpoint, error: extractErrorMessage(res) };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      endpoint,
      error: err instanceof Error ? err.message : 'Nezuko Qwen 7B request failed.',
    };
  }
}
