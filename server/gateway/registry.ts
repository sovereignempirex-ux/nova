import { randomUUID } from 'node:crypto';
import { PLATFORM_CONFIG } from '../services/config.ts';
import type {
  DetailedAvailabilityStatus,
  FallbackRule,
  ModelRecord,
  ProviderCapability,
  ProviderHealthStatus,
  ProviderRecord,
} from './types.ts';

const now = new Date().toISOString();

const providers = new Map<string, ProviderRecord>();
const models = new Map<string, ModelRecord>();
const fallbackRules = new Map<string, FallbackRule>();

function seedRegistry() {
  const initialProviders: ProviderRecord[] = [
    {
      id: 'prov_nova_router',
      name: 'NOVA Free AI Router',
      slug: 'nova_router',
      baseUrl: 'internal://nova-free-router',
      apiStyle: 'capability_router',
      authType: 'none',
      capabilities: ['text_generation', 'text-to-image', 'image_generation'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: 'healthy',
      availabilityStatus: 'Working',
      freeTierLimits: {
        permanentlyFree: true,
        notes: 'Routes strictly to enabled free-tier working providers; never silently uses paid APIs.',
      },
      commercialUse: 'check_terms',
      config: { strategy: 'free_working_first' },
      endpoints: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_free_ai_custom',
      name: 'Free AI Custom',
      slug: 'free_ai_custom',
      baseUrl: PLATFORM_CONFIG.freeAiEndpoint,
      apiStyle: 'sse_chat_image',
      authType: 'none',
      capabilities: ['text_generation', 'text-to-image', 'image_generation'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: 'healthy',
      availabilityStatus: 'Working',
      freeTierLimits: {
        rpm: 30,
        rpd: 500,
        permanentlyFree: false,
        notes: 'Community open endpoint (no API key required); subject to upstream concurrency limits.',
      },
      commercialUse: 'check_terms',
      contextWindow: 32768,
      config: {
        model: 'qwen7b',
        stream: true,
        defaultLang: 'ar',
      },
      endpoints: [
        {
          id: 'ep_free_ai_chat',
          name: 'SSE Chat & Image Synthesis',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'text-to-image',
          modelName: 'qwen7b (Qwen3-30B-A3B / SDXL)',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [
            { name: 'model', location: 'body', required: true, description: 'Fixed to qwen7b' },
            { name: 'stream', location: 'body', required: true, description: 'true for SSE streaming' },
            { name: 'messages', location: 'body', required: true, description: 'Array of {role, content} objects' },
          ],
          exampleRequest: JSON.stringify(
            {
              model: 'qwen7b',
              stream: true,
              messages: [{ role: 'user', content: 'Hello, respond in Arabic.' }],
            },
            null,
            2
          ),
          verifiedResponseSchema:
            'text/event-stream emitting OpenAI choices[0].delta.content chunks and data: {"tool_result":{"type":"image","url":"...","model":"sdxl"}}',
          knownLimitations: 'Does not support explicit aspect ratio parameter.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_pollinations_text',
      name: 'Pollinations Text (Anonymous Tier)',
      slug: 'pollinations_text',
      baseUrl: 'https://text.pollinations.ai/openai',
      apiStyle: 'openai_sse',
      authType: 'none',
      capabilities: ['text_generation'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: 'healthy',
      availabilityStatus: 'Working',
      freeTierLimits: {
        rpm: 20,
        rpd: 400,
        permanentlyFree: false,
        notes: 'Anonymous keyless tier (gpt-oss-20b); subject to per-IP fair-use rate limiting.',
      },
      commercialUse: 'check_terms',
      contextWindow: 32768,
      config: { model: 'openai', stream: true },
      endpoints: [
        {
          id: 'ep_pollinations_text_sse',
          name: 'Anonymous OpenAI SSE Chat',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'openai (gpt-oss-20b)',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [
            { name: 'model', location: 'body', required: true, description: 'openai' },
            { name: 'stream', location: 'body', required: true, description: 'true for SSE' },
            { name: 'messages', location: 'body', required: true, description: 'Chat messages array' },
          ],
          exampleRequest: 'POST https://text.pollinations.ai/openai {"model":"openai","stream":true,"messages":[...]}',
          verifiedResponseSchema: 'text/event-stream OpenAI choices[0].delta.content chunks',
          knownLimitations: 'Unified gen.pollinations.ai requires an API key; anonymous tier supports text chat only.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_pollinations_image',
      name: 'Pollinations Image (Classic Cooldown)',
      slug: 'pollinations_image',
      baseUrl: 'https://image.pollinations.ai/prompt',
      apiStyle: 'rest_binary',
      authType: 'none',
      capabilities: ['text-to-image', 'image_generation'],
      requestMethod: 'GET',
      enabled: true,
      healthStatus: 'degraded',
      availabilityStatus: 'Not tested',
      freeTierLimits: {
        cooldownSeconds: 45,
        rpd: 200,
        permanentlyFree: false,
        notes: 'Enforces strict 1 uncached image per 45 seconds per IP (returns HTTP 402 FREE_LIMIT if faster).',
      },
      commercialUse: 'check_terms',
      config: { cooldownSeconds: 45 },
      endpoints: [
        {
          id: 'ep_pollinations_image_get',
          name: 'Classic Flux Image Generation',
          method: 'GET',
          path: '/{prompt}?width=768&height=768&nologo=true',
          contentType: 'image/jpeg',
          capability: 'text-to-image',
          modelName: 'flux',
          availabilityStatus: 'Not tested',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'prompt', location: 'query', required: true, description: 'Image prompt' }],
          exampleRequest: 'GET https://image.pollinations.ai/prompt/minimal%20cube?width=512&height=512&nologo=true',
          verifiedResponseSchema: 'image/jpeg binary buffer (or HTTP 402 FREE_LIMIT JSON during 45s cooldown)',
          knownLimitations: 'Rate-limited to 1 uncached generation every 45 seconds per IP without a Pollen key.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_nezuko',
      name: 'Nezuko API',
      slug: 'nezuko',
      baseUrl: PLATFORM_CONFIG.nezukoBaseUrl,
      apiStyle: 'rest_multi',
      authType: 'none',
      capabilities: [
        'text_generation',
        'image_understanding',
        'image_generation',
        'text-to-image',
        'image_enhancement',
        'search',
        'media_processing',
      ],
      requestMethod: 'GET/POST',
      enabled: true,
      healthStatus: 'degraded',
      availabilityStatus: 'Degraded',
      freeTierLimits: {
        rpm: 30,
        rpd: 500,
        permanentlyFree: false,
        notes: 'Free community REST API; Chat/YouTube/Pinterest operational while image-gen/img-to-hd/downloader are offline upstream.',
      },
      commercialUse: 'check_terms',
      config: {
        timeoutMs: PLATFORM_CONFIG.requestTimeoutMs,
      },
      endpoints: [
        {
          id: 'ep_nezuko_img_hd',
          name: 'Image Enhancement (Image to HD)',
          method: 'GET',
          path: '/api/tools/img-to-hd?url=<url>',
          contentType: 'application/json',
          capability: 'image_enhancement',
          modelName: 'nezuko:img-to-hd',
          availabilityStatus: 'Unavailable',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'url', location: 'query', required: true, description: 'Public source image URL' }],
          exampleRequest: 'GET /api/tools/img-to-hd?url=https://example.com/photo.jpg',
          knownLimitations: 'Upstream currently returns HTTP 404 (API Endpoint not found).',
        },
        {
          id: 'ep_nezuko_yt',
          name: 'YouTube Search',
          method: 'GET',
          path: '/api/search/yt-search?q=<q>',
          contentType: 'application/json',
          capability: 'search',
          modelName: 'nezuko:yt-search',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'q', location: 'query', required: true, description: 'Search query' }],
          exampleRequest: 'GET /api/search/yt-search?q=lofi',
          verifiedResponseSchema: '{ success: boolean, main_result: {...}, results: [{ title, url, duration, views, thumbnail, author }] }',
        },
        {
          id: 'ep_nezuko_pin',
          name: 'Pinterest Search',
          method: 'GET',
          path: '/api/search/pinterest-search?q=<q>',
          contentType: 'application/json',
          capability: 'search',
          modelName: 'nezuko:pinterest-search',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'q', location: 'query', required: true, description: 'Visual search query' }],
          exampleRequest: 'GET /api/search/pinterest-search?q=minimalist',
          verifiedResponseSchema: '{ success: boolean, results: [{ pin_id, title, image_url, stats, publisher }] }',
        },
        {
          id: 'ep_nezuko_dl',
          name: 'Media Downloader',
          method: 'GET',
          path: '/api/download/all-download-media?url=<url>',
          contentType: 'application/json',
          capability: 'media_processing',
          modelName: 'nezuko:media-downloader',
          availabilityStatus: 'Unavailable',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'url', location: 'query', required: true, description: 'Target media page URL' }],
          exampleRequest: 'GET /api/download/all-download-media?url=https://www.youtube.com/watch?v=...',
          knownLimitations: 'Upstream currently returns HTTP 500 (Request failed with status code 403).',
        },
        {
          id: 'ep_nezuko_flux',
          name: 'Flux Image Generation',
          method: 'GET',
          path: '/api/aiimg/fulx-img-create-v1?prompt=<prompt>&aspect=<aspect>',
          contentType: 'application/json',
          capability: 'image_generation',
          modelName: 'nezuko:flux-v1',
          availabilityStatus: 'Unavailable',
          successCount: 0,
          errorCount: 0,
          parameters: [
            { name: 'prompt', location: 'query', required: true, description: 'Image generation prompt' },
            { name: 'aspect', location: 'query', required: false, description: 'square | landscape | portrait' },
          ],
          exampleRequest: 'GET /api/aiimg/fulx-img-create-v1?prompt=minimal%20cube&aspect=square',
          knownLimitations: 'Upstream gateway reports FLUX model unreachable (HTTP 500).',
        },
        {
          id: 'ep_nezuko_monte',
          name: 'Monte AI Image Generation',
          method: 'GET',
          path: '/api/aiimg/monte-ai-generate-image?prompt=<prompt>',
          contentType: 'application/json',
          capability: 'image_generation',
          modelName: 'nezuko:monte-ai',
          availabilityStatus: 'Unavailable',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'prompt', location: 'query', required: true, description: 'Image generation prompt' }],
          exampleRequest: 'GET /api/aiimg/monte-ai-generate-image?prompt=minimal%20cube',
          knownLimitations: 'Upstream currently returns HTTP 500 due to depleted upstream balance.',
        },
        {
          id: 'ep_nezuko_gemini',
          name: 'Nezuko Gemini Chat',
          method: 'POST',
          path: '/api/ai/gemini-chat',
          contentType: 'multipart/form-data',
          capability: 'image_understanding',
          modelName: 'nezuko:gemini-chat',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [
            { name: 'prompt', location: 'formData', required: true, description: 'User message prompt' },
            { name: 'lang', location: 'formData', required: true, description: 'en | ar' },
            { name: 'image', location: 'formData', required: false, description: 'Optional uploaded image binary' },
          ],
          exampleRequest: 'POST /api/ai/gemini-chat (multipart/form-data: prompt, lang, image?)',
          verifiedResponseSchema: '{ success: true, reply: string, model: string, conversation_id: string, elapsed_ms: number }',
        },
        {
          id: 'ep_nezuko_qwen',
          name: 'Nezuko Qwen 7B',
          method: 'GET',
          path: '/api/ai/Qwen-7B?prompt=<prompt>&model=<model>&lang=<lang>',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'nezuko:qwen-7b',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [
            { name: 'prompt', location: 'query', required: true, description: 'Prompt text' },
            { name: 'model', location: 'query', required: true, description: 'Must pass qwen7b' },
            { name: 'lang', location: 'query', required: true, description: 'en | ar' },
          ],
          exampleRequest: 'GET /api/ai/Qwen-7B?prompt=Hello&model=qwen7b&lang=en',
          verifiedResponseSchema: '{ success: true, reply: string, model: "qwen7b", lang: string, elapsed_ms: number }',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_google_gemini',
      name: 'Google Gemini SDK',
      slug: 'google_gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiStyle: 'google_genai_sdk',
      authType: 'env_api_key',
      capabilities: ['text_generation', 'image_understanding', 'image_generation', 'search'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: process.env.GEMINI_API_KEY ? 'healthy' : 'unavailable',
      availabilityStatus: process.env.GEMINI_API_KEY ? 'Not tested' : 'Authentication required',
      freeTierLimits: {
        rpm: 15,
        rpd: 250,
        permanentlyFree: true,
        notes: 'Google AI Studio Free Tier (5-15 RPM, model-specific RPD); unpaid inputs may be reviewed to improve Google products.',
      },
      commercialUse: 'restricted',
      contextWindow: 1_000_000,
      lastError: process.env.GEMINI_API_KEY ? undefined : 'GEMINI_API_KEY not configured in Settings > Secrets',
      config: { envVar: 'GEMINI_API_KEY' },
      endpoints: [
        {
          id: 'ep_gemini_stream',
          name: 'generateContentStream',
          method: 'POST',
          path: 'sdk:ai.models.generateContentStream',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'gemini-4-hydrogen',
          availabilityStatus: process.env.GEMINI_API_KEY ? 'Not tested' : 'Authentication required',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'model', location: 'body', required: true, description: 'Verified Gemini model ID' }],
          exampleRequest: 'ai.models.generateContentStream({ model: "gemini-4-hydrogen", contents })',
          knownLimitations: 'Requires server-side GEMINI_API_KEY; Pro & image models require billing.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_groq',
      name: 'GroqCloud (Free Tier)',
      slug: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiStyle: 'openai_sse',
      authType: 'env_api_key',
      capabilities: ['text_generation'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: process.env.GROQ_API_KEY ? 'unknown' : 'unavailable',
      availabilityStatus: process.env.GROQ_API_KEY ? 'Not tested' : 'Authentication required',
      freeTierLimits: {
        rpm: 30,
        rpd: 1000,
        tpm: 8000,
        tpd: 200000,
        permanentlyFree: true,
        notes: 'Free developer tier (no credit card required); limits shared across organization per model.',
      },
      commercialUse: 'allowed',
      contextWindow: 131072,
      lastError: process.env.GROQ_API_KEY ? undefined : 'GROQ_API_KEY not configured in Settings > Secrets',
      config: { envVar: 'GROQ_API_KEY' },
      endpoints: [
        {
          id: 'ep_groq_chat',
          name: 'Groq OpenAI SSE Chat',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'llama-3.3-70b-versatile',
          availabilityStatus: process.env.GROQ_API_KEY ? 'Not tested' : 'Authentication required',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'model', location: 'body', required: true, description: 'llama-3.3-70b-versatile | qwen/qwen3-32b' }],
          exampleRequest: 'POST https://api.groq.com/openai/v1/chat/completions',
          knownLimitations: '8,000 TPM cap on free tier triggers HTTP 413 on huge single prompts.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_openrouter_free',
      name: 'OpenRouter (:free Router)',
      slug: 'openrouter_free',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiStyle: 'openai_sse',
      authType: 'env_api_key',
      capabilities: ['text_generation'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: process.env.OPENROUTER_API_KEY ? 'unknown' : 'unavailable',
      availabilityStatus: process.env.OPENROUTER_API_KEY ? 'Not tested' : 'Authentication required',
      freeTierLimits: {
        rpm: 20,
        rpd: 50,
        permanentlyFree: true,
        notes: '20 RPM global; 50 RPD free (<$10 lifetime credits) or 1,000 RPD (>=$10 lifetime credits). Resets 00:00 UTC.',
      },
      commercialUse: 'check_terms',
      contextWindow: 128000,
      lastError: process.env.OPENROUTER_API_KEY ? undefined : 'OPENROUTER_API_KEY not configured in Settings > Secrets',
      config: { envVar: 'OPENROUTER_API_KEY' },
      endpoints: [
        {
          id: 'ep_openrouter_free',
          name: 'OpenRouter Free Models Router',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'openrouter/free',
          availabilityStatus: process.env.OPENROUTER_API_KEY ? 'Not tested' : 'Authentication required',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'model', location: 'body', required: true, description: 'openrouter/free' }],
          exampleRequest: 'POST https://openrouter.ai/api/v1/chat/completions {"model":"openrouter/free",...}',
          knownLimitations: 'Failed requests still deduct from daily 50 RPD pool.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_cloudflare_ai',
      name: 'Cloudflare Workers AI',
      slug: 'cloudflare_workers_ai',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
      apiStyle: 'rest_json',
      authType: 'env_api_key',
      capabilities: ['text_generation', 'embeddings'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN ? 'unknown' : 'unavailable',
      availabilityStatus:
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN ? 'Not tested' : 'Authentication required',
      freeTierLimits: {
        dailyNeurons: 10000,
        rpd: 300,
        permanentlyFree: true,
        notes: '10,000 free Neurons per day resetting 00:00 UTC; requests stop cleanly on Free plan once depleted.',
      },
      commercialUse: 'allowed',
      contextWindow: 8192,
      lastError:
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
          ? undefined
          : 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured in Settings > Secrets',
      config: { envVar: 'CLOUDFLARE_API_TOKEN' },
      endpoints: [
        {
          id: 'ep_cloudflare_llama',
          name: 'Workers AI Inference',
          method: 'POST',
          path: '/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: '@cf/meta/llama-3.1-8b-instruct',
          availabilityStatus:
            process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
              ? 'Not tested'
              : 'Authentication required',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'messages', location: 'body', required: true, description: 'Messages array' }],
          exampleRequest: 'POST /client/v4/accounts/{id}/ai/run/@cf/meta/llama-3.1-8b-instruct',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_huggingface',
      name: 'Hugging Face Inference Providers',
      slug: 'huggingface_inference',
      baseUrl: 'https://router.huggingface.co/v1/chat/completions',
      apiStyle: 'openai_sse',
      authType: 'env_api_key',
      capabilities: ['text_generation', 'embeddings'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: process.env.HF_TOKEN ? 'unknown' : 'unavailable',
      availabilityStatus: process.env.HF_TOKEN ? 'Not tested' : 'Authentication required',
      freeTierLimits: {
        monthlyCredits: '$0.10/month free credits',
        rpd: 100,
        permanentlyFree: false,
        notes: 'Very small ~$0.10/month credit allowance; intended for light prototyping only.',
      },
      commercialUse: 'check_terms',
      contextWindow: 32768,
      lastError: process.env.HF_TOKEN ? undefined : 'HF_TOKEN not configured in Settings > Secrets',
      config: { envVar: 'HF_TOKEN' },
      endpoints: [
        {
          id: 'ep_hf_router',
          name: 'HF Inference Router Chat',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'text_generation',
          modelName: 'Qwen/Qwen2.5-7B-Instruct',
          availabilityStatus: process.env.HF_TOKEN ? 'Not tested' : 'Authentication required',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'model', location: 'body', required: true, description: 'HF model ID' }],
          exampleRequest: 'POST https://router.huggingface.co/v1/chat/completions',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prov_anilist',
      name: 'AniList GraphQL',
      slug: 'anilist',
      baseUrl: 'https://graphql.anilist.co',
      apiStyle: 'graphql',
      authType: 'none',
      capabilities: ['search'],
      requestMethod: 'POST',
      enabled: true,
      healthStatus: 'healthy',
      availabilityStatus: 'Working',
      freeTierLimits: {
        rpm: 90,
        permanentlyFree: true,
        notes: 'Open public GraphQL API (90 req/min).',
      },
      commercialUse: 'check_terms',
      config: {},
      endpoints: [
        {
          id: 'ep_anilist_gql',
          name: 'Anime Catalog GraphQL',
          method: 'POST',
          path: '/',
          contentType: 'application/json',
          capability: 'search',
          modelName: 'AniList GraphQL v2',
          availabilityStatus: 'Working',
          successCount: 0,
          errorCount: 0,
          parameters: [{ name: 'query', location: 'body', required: true, description: 'GraphQL query' }],
          exampleRequest: 'POST https://graphql.anilist.co { query, variables }',
          verifiedResponseSchema: '{ data: { Page: { media: [...] } } }',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const p of initialProviders) {
    providers.set(p.id, p);
  }

  const initialModels: ModelRecord[] = [
    {
      id: 'auto:free-chat',
      name: 'NOVA Free Auto-Router (Best Available Chat)',
      providerId: 'prov_nova_router',
      providerSlug: 'nova_router',
      modelIdentifier: 'auto-free-chat',
      capabilities: ['text_generation', 'image_understanding'],
      supportedLanguages: ['ar', 'en'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text', 'image'],
      streamingSupport: true,
      contextWindow: 32768,
      configSchema: { strategy: 'free_only_automatic_failover' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Automatically routes chat to the healthiest verified free AI provider with safe fallback.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'auto:free-image',
      name: 'NOVA Free Auto-Router (Best Available Image)',
      providerId: 'prov_nova_router',
      providerSlug: 'nova_router',
      modelIdentifier: 'auto-free-image',
      capabilities: ['text-to-image', 'image_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: { strategy: 'free_only_image_failover' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Automatically selects verified free text-to-image providers (Free AI SDXL / Pollinations cooldown).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'free_ai_custom:qwen7b',
      name: 'Free AI Custom · Qwen 7B (SDXL)',
      providerId: 'prov_free_ai_custom',
      providerSlug: 'free_ai_custom',
      modelIdentifier: 'qwen7b',
      capabilities: ['text_generation', 'text-to-image', 'image_generation'],
      supportedLanguages: ['ar', 'en'],
      inputTypes: ['text'],
      outputTypes: ['text', 'image'],
      streamingSupport: true,
      contextWindow: 32768,
      configSchema: { stream: true, defaultLang: 'ar' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'SSE streaming chat and SDXL text-to-image synthesis via api.free.ai (Arabic & English).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'pollinations_text:openai',
      name: 'Pollinations · GPT-OSS 20B (Free Anonymous)',
      providerId: 'prov_pollinations_text',
      providerSlug: 'pollinations_text',
      modelIdentifier: 'openai',
      capabilities: ['text_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 32768,
      configSchema: { endpoint: 'https://text.pollinations.ai/openai', tier: 'anonymous' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Keyless SSE streaming chat via Pollinations anonymous tier (gpt-oss-20b).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'pollinations_image:flux',
      name: 'Pollinations · Flux (45s Free Cooldown)',
      providerId: 'prov_pollinations_image',
      providerSlug: 'pollinations_image',
      modelIdentifier: 'flux',
      capabilities: ['text-to-image', 'image_generation'],
      supportedLanguages: ['en'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: { cooldownSeconds: 45 },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Keyless classic Pollinations image generation (strictly 1 uncached image every 45s per IP).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:gemini-chat',
      name: 'Nezuko · Gemini Chat',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'gemini-chat',
      capabilities: ['text_generation', 'image_understanding'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      streamingSupport: false,
      configSchema: { contentType: 'multipart/form-data' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Multimodal multipart/form-data chat via Nezuko API (prompt, lang, optional image).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:qwen-7b',
      name: 'Nezuko · Qwen 7B',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'qwen7b',
      capabilities: ['text_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: false,
      configSchema: { queryModel: 'qwen7b' },
      active: true,
      verified: true,
      tier: 'free',
      description: 'Fast multilingual Qwen 7B completion via Nezuko API.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:flux-v1',
      name: 'Nezuko · Flux v1',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'fulx-img-create-v1',
      capabilities: ['image_generation', 'text-to-image'],
      supportedLanguages: ['en'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: { aspects: ['square', 'landscape', 'portrait'] },
      active: true,
      verified: false,
      tier: 'free',
      description: 'Flux image creation endpoint (/api/aiimg/fulx-img-create-v1); currently returning upstream error.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:monte-ai',
      name: 'Nezuko · Monte AI',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'monte-ai-generate-image',
      capabilities: ['image_generation', 'text-to-image'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: {},
      active: true,
      verified: false,
      tier: 'free',
      description: 'Monte AI image generation endpoint; currently paused upstream (balance depleted).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:img-to-hd',
      name: 'Nezuko · Image to HD',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'img-to-hd',
      capabilities: ['image_enhancement'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['url'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: {},
      active: true,
      verified: false,
      tier: 'free',
      description: 'Remote image upscaler (/api/tools/img-to-hd); currently returning HTTP 404 upstream.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:yt-search',
      name: 'Nezuko · YouTube Search',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'yt-search',
      capabilities: ['search'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['json'],
      streamingSupport: false,
      configSchema: {},
      active: true,
      verified: true,
      tier: 'free',
      description: 'Live YouTube video metadata search via Nezuko API.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:pinterest-search',
      name: 'Nezuko · Pinterest Search',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'pinterest-search',
      capabilities: ['search'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['json'],
      streamingSupport: false,
      configSchema: {},
      active: true,
      verified: true,
      tier: 'free',
      description: 'Live Pinterest visual pin search via Nezuko API.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'nezuko:media-downloader',
      name: 'Nezuko · All Download Media',
      providerId: 'prov_nezuko',
      providerSlug: 'nezuko',
      modelIdentifier: 'all-download-media',
      capabilities: ['media_processing'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['url'],
      outputTypes: ['media'],
      streamingSupport: false,
      configSchema: {},
      active: true,
      verified: false,
      tier: 'free',
      description: 'Social media downloader endpoint; currently returns upstream 403/500.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'groq:llama-3.3-70b-versatile',
      name: 'Groq · Llama 3.3 70B Versatile (Free Tier Key)',
      providerId: 'prov_groq',
      providerSlug: 'groq',
      modelIdentifier: 'llama-3.3-70b-versatile',
      capabilities: ['text_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 131072,
      configSchema: { rpm: 30, rpd: 1000, tpm: 8000 },
      active: true,
      verified: Boolean(process.env.GROQ_API_KEY),
      tier: 'free',
      description: 'Fast Groq LPU free-tier model (requires GROQ_API_KEY in Settings > Secrets).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'openrouter:free',
      name: 'OpenRouter · Free Models Router (Key)',
      providerId: 'prov_openrouter_free',
      providerSlug: 'openrouter_free',
      modelIdentifier: 'openrouter/free',
      capabilities: ['text_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 128000,
      configSchema: { rpm: 20, rpd: 50 },
      active: true,
      verified: Boolean(process.env.OPENROUTER_API_KEY),
      tier: 'free',
      description: 'Routes to OpenRouter :free models (50 RPD free / 1000 RPD >=$10 credit; requires OPENROUTER_API_KEY).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cloudflare:llama-3.1-8b',
      name: 'Cloudflare · Llama 3.1 8B (10k Neurons/Day)',
      providerId: 'prov_cloudflare_ai',
      providerSlug: 'cloudflare_workers_ai',
      modelIdentifier: '@cf/meta/llama-3.1-8b-instruct',
      capabilities: ['text_generation'],
      supportedLanguages: ['en'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: false,
      contextWindow: 8192,
      configSchema: { dailyNeurons: 10000 },
      active: true,
      verified: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
      tier: 'free',
      description: 'Cloudflare Workers AI 10k free Neurons/day tier (requires CLOUDFLARE_ACCOUNT_ID & CLOUDFLARE_API_TOKEN).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'huggingface:qwen2.5-7b',
      name: 'Hugging Face · Qwen 2.5 7B Instruct (Free Credit)',
      providerId: 'prov_huggingface',
      providerSlug: 'huggingface_inference',
      modelIdentifier: 'Qwen/Qwen2.5-7B-Instruct',
      capabilities: ['text_generation'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 32768,
      configSchema: { monthlyCredits: '$0.10/mo' },
      active: true,
      verified: Boolean(process.env.HF_TOKEN),
      tier: 'free',
      description: 'Hugging Face Inference Router (~$0.10/mo free credits; requires HF_TOKEN).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-4-hydrogen',
      name: 'Gemini 4 Hydrogen',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-4-hydrogen',
      capabilities: ['text_generation', 'image_understanding', 'search'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 1_000_000,
      configSchema: { thinkingLevel: ['LOW', 'MEDIUM', 'HIGH'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'free',
      description: 'Fast, balanced Google Gemini reasoning with SSE streaming (requires GEMINI_API_KEY).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-3.1-flash-lite',
      name: 'Gemini 3.1 Flash Lite',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-3.1-flash-lite',
      capabilities: ['text_generation', 'image_understanding'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      streamingSupport: true,
      contextWindow: 1_000_000,
      configSchema: { thinkingLevel: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'free',
      description: 'Low-latency Google Gemini model for quick drafts and summaries.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-4-neon',
      name: 'Gemini 4 Neon',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-4-neon',
      capabilities: ['text_generation', 'image_understanding'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      streamingSupport: true,
      configSchema: { thinkingLevel: ['LOW', 'MEDIUM', 'HIGH'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'paid',
      description: 'Complex reasoning and coding model (requires billing-enabled Gemini key).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-4-carbon',
      name: 'Gemini 4 Carbon',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-4-carbon',
      capabilities: ['text_generation', 'image_understanding'],
      supportedLanguages: ['en', 'ar'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      streamingSupport: true,
      configSchema: { thinkingLevel: ['LOW', 'MEDIUM', 'HIGH'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'paid',
      description: 'Deep architectural reasoning model (requires billing-enabled Gemini key).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-3.1-flash-lite-image',
      name: 'Gemini 3.1 Flash Lite Image',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-3.1-flash-lite-image',
      capabilities: ['image_generation', 'text-to-image'],
      supportedLanguages: ['en'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: { aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'paid',
      description: 'Google Gemini image generation (requires billing-enabled API key).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini-nano-banana-2.1',
      name: 'Nano Banana 2.1',
      providerId: 'prov_google_gemini',
      providerSlug: 'google_gemini',
      modelIdentifier: 'gemini-nano-banana-2.1',
      capabilities: ['image_generation', 'text-to-image'],
      supportedLanguages: ['en'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      streamingSupport: false,
      configSchema: { imageSizes: ['1K', '2K', '4K'] },
      active: true,
      verified: Boolean(process.env.GEMINI_API_KEY),
      tier: 'paid',
      description: 'High-resolution image generation up to 4K (requires billing-enabled API key).',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const m of initialModels) {
    models.set(m.id, m);
  }

  const initialFallbacks: FallbackRule[] = [
    {
      id: 'fb_text_gemini_to_free_ai',
      capability: 'text_generation',
      primaryProviderSlug: 'google_gemini',
      fallbackProviderSlug: 'free_ai_custom',
      fallbackModelId: 'free_ai_custom:qwen7b',
      requireCompatibleIo: true,
      priority: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'fb_text_nezuko_to_pollinations',
      capability: 'text_generation',
      primaryProviderSlug: 'nezuko',
      fallbackProviderSlug: 'pollinations_text',
      fallbackModelId: 'pollinations_text:openai',
      requireCompatibleIo: true,
      priority: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'fb_text_free_ai_to_pollinations',
      capability: 'text_generation',
      primaryProviderSlug: 'free_ai_custom',
      fallbackProviderSlug: 'pollinations_text',
      fallbackModelId: 'pollinations_text:openai',
      requireCompatibleIo: true,
      priority: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'fb_image_nezuko_to_free_ai',
      capability: 'text-to-image',
      primaryProviderSlug: 'nezuko',
      fallbackProviderSlug: 'free_ai_custom',
      fallbackModelId: 'free_ai_custom:qwen7b',
      requireCompatibleIo: true,
      priority: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'fb_image_pollinations_to_free_ai',
      capability: 'text-to-image',
      primaryProviderSlug: 'pollinations_image',
      fallbackProviderSlug: 'free_ai_custom',
      fallbackModelId: 'free_ai_custom:qwen7b',
      requireCompatibleIo: true,
      priority: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'fb_image_free_ai_to_pollinations',
      capability: 'text-to-image',
      primaryProviderSlug: 'free_ai_custom',
      fallbackProviderSlug: 'pollinations_image',
      fallbackModelId: 'pollinations_image:flux',
      requireCompatibleIo: true,
      priority: 2,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const fb of initialFallbacks) {
    fallbackRules.set(fb.id, fb);
  }
}

seedRegistry();

export function listProviders(): ProviderRecord[] {
  return Array.from(providers.values());
}

export function getProviderById(id: string): ProviderRecord | undefined {
  return providers.get(id);
}

export function getProviderBySlug(slug: string): ProviderRecord | undefined {
  return Array.from(providers.values()).find((p) => p.slug === slug);
}

export function upsertProvider(
  input: Partial<ProviderRecord> & { name: string; slug: string; baseUrl: string }
): ProviderRecord {
  const existing = input.id ? providers.get(input.id) : getProviderBySlug(input.slug);
  const ts = new Date().toISOString();
  const record: ProviderRecord = {
    id: existing?.id || input.id || `prov_${randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
    baseUrl: input.baseUrl.trim(),
    apiStyle: input.apiStyle || existing?.apiStyle || 'rest_json',
    authType: input.authType || existing?.authType || 'none',
    capabilities: input.capabilities ?? existing?.capabilities ?? [],
    requestMethod: input.requestMethod || existing?.requestMethod || 'GET',
    enabled: input.enabled ?? existing?.enabled ?? true,
    healthStatus: input.healthStatus ?? existing?.healthStatus ?? 'unknown',
    availabilityStatus: input.availabilityStatus ?? existing?.availabilityStatus ?? 'Not tested',
    freeTierLimits: input.freeTierLimits ?? existing?.freeTierLimits ?? { notes: 'Custom provider' },
    commercialUse: input.commercialUse ?? existing?.commercialUse ?? 'check_terms',
    contextWindow: input.contextWindow ?? existing?.contextWindow,
    lastCheckedAt: input.lastCheckedAt ?? existing?.lastCheckedAt,
    lastLatencyMs: input.lastLatencyMs ?? existing?.lastLatencyMs,
    lastError: input.lastError ?? existing?.lastError,
    config: input.config ?? existing?.config ?? {},
    endpoints: input.endpoints ?? existing?.endpoints ?? [],
    createdAt: existing?.createdAt || ts,
    updatedAt: ts,
  };
  providers.set(record.id, record);
  return record;
}

export function setProviderHealth(
  slug: string,
  status: ProviderHealthStatus,
  errorMsg?: string,
  availabilityStatus?: DetailedAvailabilityStatus,
  latencyMs?: number
) {
  const prov = getProviderBySlug(slug);
  if (!prov) return;
  prov.healthStatus = status;
  if (availabilityStatus) {
    prov.availabilityStatus = availabilityStatus;
  } else if (status === 'healthy') {
    prov.availabilityStatus = 'Working';
  } else if (status === 'degraded') {
    prov.availabilityStatus = 'Degraded';
  } else if (status === 'unavailable') {
    prov.availabilityStatus = errorMsg?.toLowerCase().includes('not configured')
      ? 'Authentication required'
      : 'Unavailable';
  }
  prov.lastCheckedAt = new Date().toISOString();
  if (typeof latencyMs === 'number') prov.lastLatencyMs = latencyMs;
  prov.lastError = errorMsg;
  prov.updatedAt = prov.lastCheckedAt;
}

export function recordEndpointTelemetry(params: {
  providerSlug: string;
  endpointId: string;
  httpStatus: number;
  responseTimeMs: number;
  passed: boolean;
  status: DetailedAvailabilityStatus;
}) {
  const prov = getProviderBySlug(params.providerSlug);
  if (!prov) return;
  const ep = prov.endpoints.find((e) => e.id === params.endpointId);
  if (ep) {
    ep.lastTestedAt = new Date().toISOString();
    ep.lastHttpStatus = params.httpStatus;
    ep.lastResponseTimeMs = Math.round(params.responseTimeMs);
    ep.availabilityStatus = params.status;
    ep.successCount = (ep.successCount || 0) + (params.passed ? 1 : 0);
    ep.errorCount = (ep.errorCount || 0) + (params.passed ? 0 : 1);
  }
  prov.lastCheckedAt = new Date().toISOString();
  prov.lastLatencyMs = Math.round(params.responseTimeMs);
  prov.updatedAt = prov.lastCheckedAt;
}

export function listModels(filter?: {
  providerId?: string;
  capability?: ProviderCapability;
  activeOnly?: boolean;
}): ModelRecord[] {
  let list = Array.from(models.values());
  if (filter?.providerId) list = list.filter((m) => m.providerId === filter.providerId);
  if (filter?.capability) list = list.filter((m) => m.capabilities.includes(filter.capability!));
  if (filter?.activeOnly) list = list.filter((m) => m.active);
  return list;
}

export function getModelById(id: string): ModelRecord | undefined {
  return models.get(id);
}

export function upsertModel(
  input: Partial<ModelRecord> & { id: string; name: string; providerId: string; modelIdentifier: string }
): ModelRecord {
  const existing = models.get(input.id);
  const prov = providers.get(input.providerId);
  if (!prov) throw new Error('Target provider does not exist.');
  const ts = new Date().toISOString();

  const record: ModelRecord = {
    id: input.id.trim(),
    name: input.name.trim(),
    providerId: prov.id,
    providerSlug: prov.slug,
    modelIdentifier: input.modelIdentifier.trim(),
    capabilities: input.capabilities ?? existing?.capabilities ?? ['text_generation'],
    supportedLanguages: input.supportedLanguages ?? existing?.supportedLanguages ?? ['en'],
    inputTypes: input.inputTypes ?? existing?.inputTypes ?? ['text'],
    outputTypes: input.outputTypes ?? existing?.outputTypes ?? ['text'],
    streamingSupport: input.streamingSupport ?? existing?.streamingSupport ?? false,
    contextWindow: input.contextWindow ?? existing?.contextWindow,
    configSchema: input.configSchema ?? existing?.configSchema ?? {},
    active: input.active ?? existing?.active ?? true,
    verified: input.verified ?? existing?.verified ?? false,
    tier: input.tier ?? existing?.tier ?? 'free',
    description: input.description ?? existing?.description ?? '',
    createdAt: existing?.createdAt || ts,
    updatedAt: ts,
  };
  models.set(record.id, record);
  return record;
}

export function listFallbackRules(): FallbackRule[] {
  return Array.from(fallbackRules.values()).sort((a, b) => a.priority - b.priority);
}

export function upsertFallbackRule(
  input: Omit<FallbackRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): FallbackRule {
  const existing = input.id ? fallbackRules.get(input.id) : undefined;
  const fallbackModel = models.get(input.fallbackModelId);
  if (!fallbackModel) {
    throw new Error('Fallback model not found in registry.');
  }
  if (!fallbackModel.capabilities.includes(input.capability)) {
    throw new Error(
      `Fallback model ${fallbackModel.id} does not support capability "${input.capability}". Never replace incompatible capabilities.`
    );
  }
  const ts = new Date().toISOString();
  const rule: FallbackRule = {
    id: existing?.id || input.id || `fb_${randomUUID().slice(0, 8)}`,
    capability: input.capability,
    primaryProviderSlug: input.primaryProviderSlug,
    primaryModelId: input.primaryModelId,
    fallbackProviderSlug: input.fallbackProviderSlug,
    fallbackModelId: input.fallbackModelId,
    requireCompatibleIo: input.requireCompatibleIo ?? true,
    priority: input.priority ?? 1,
    enabled: input.enabled ?? true,
    createdAt: existing?.createdAt || ts,
    updatedAt: ts,
  };
  fallbackRules.set(rule.id, rule);
  return rule;
}

export function deleteFallbackRule(id: string): boolean {
  return fallbackRules.delete(id);
}

export function resolveCompatibleFallback(params: {
  capability: ProviderCapability;
  primaryModelId: string;
  requiresImageInput?: boolean;
}): ModelRecord | null {
  const primaryModel = models.get(params.primaryModelId);
  if (!primaryModel) return null;

  const rules = listFallbackRules().filter(
    (r) =>
      r.enabled &&
      r.capability === params.capability &&
      r.primaryProviderSlug === primaryModel.providerSlug &&
      (!r.primaryModelId || r.primaryModelId === primaryModel.id)
  );

  for (const rule of rules) {
    const candidate = models.get(rule.fallbackModelId);
    const provider = candidate ? getProviderBySlug(candidate.providerSlug) : undefined;
    if (!candidate || !provider || !candidate.active || !provider.enabled) continue;
    if (candidate.tier === 'paid') continue; // Never silently fall back onto paid APIs
    if (!candidate.capabilities.includes(params.capability)) continue;
    if (params.requiresImageInput && !candidate.inputTypes.includes('image')) continue;
    if (rule.requireCompatibleIo) {
      const outputMatch = primaryModel.outputTypes.some((out) => candidate.outputTypes.includes(out));
      if (!outputMatch) continue;
    }
    return candidate;
  }
  return null;
}
