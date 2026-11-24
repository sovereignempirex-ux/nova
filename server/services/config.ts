export interface ProviderConfig {
  nezukoBaseUrl: string;
  freeAiEndpoint: string;
  freeAiProviderSlug: string;
  freeAiModelId: string;
  freeAiCapability: string;
  freeAiApiStyle: string;
  freeAiDefaultLang: string;
  freeAiActive: boolean;
  supabaseUrl: string;
  supabaseProjectRef: string;
  supabaseBucket: string;
  supabaseMaxBytes: number;
  supabaseAllowedMimeTypes: string[];
  requestTimeoutMs: number;
}

export const PLATFORM_CONFIG: ProviderConfig = {
  nezukoBaseUrl: (process.env.NEZUKO_API_BASE_URL || 'https://api.nezuko-wa.web.id').replace(/\/+$/, ''),
  freeAiEndpoint: process.env.FREE_AI_ENDPOINT || 'https://api.free.ai/v1/chat/',
  freeAiProviderSlug: 'free_ai_custom',
  freeAiModelId: 'qwen7b',
  freeAiCapability: 'text-to-image',
  freeAiApiStyle: 'sse_chat_image',
  freeAiDefaultLang: 'ar',
  freeAiActive: true,
  supabaseUrl: (process.env.SUPABASE_URL || 'https://jlexjqlehjtjzjoqgcwo.supabase.co').replace(/\/+$/, ''),
  supabaseProjectRef: 'jlexjqlehjtjzjoqgcwo',
  supabaseBucket: 'nova-assets',
  supabaseMaxBytes: 25 * 1024 * 1024, // 25 MB
  supabaseAllowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  requestTimeoutMs: 25000,
};

export function normalizeLang(lang: unknown, fallback: 'en' | 'ar' = 'en'): 'en' | 'ar' {
  if (lang === 'ar' || lang === 'en') return lang;
  return fallback;
}
