import { GoogleGenAI } from '@google/genai';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown): { status: number; message: string; code: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message: 'API key rejected or lacks permission for this model. Check your key in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota') || lower.includes('billing')) {
    return {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message: 'Quota exceeded or this model requires a billing-enabled API key. Select a paid key in Settings > Secrets or switch to a free-tier model like gemini-4-hydrogen.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Requested model is unavailable or unsupported. Try selecting gemini-4-hydrogen.',
    };
  }
  if (lower.includes('gemini_api_key is not configured')) {
    return {
      status: 503,
      code: 'MISSING_KEY',
      message: 'Server Gemini API key is not configured. Add GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    code: 'UPSTREAM_ERROR',
    message: raw || 'Unexpected error communicating with Gemini API.',
  };
}
