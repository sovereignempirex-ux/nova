export interface ChatModelInfo {
  id: string;
  provider: string;
  label: string;
  description: string;
  tier: 'free' | 'paid';
  supportsThinking: boolean;
  supportsImageInput: boolean;
  supportsImageOutput: boolean;
  supportsStreaming: boolean;
  supportedLanguages?: string[];
  verified?: boolean;
}

export interface ImageProviderInfo {
  id: string;
  providerSlug: string;
  label: string;
  description: string;
  tier: 'free' | 'paid';
  supportsAspect: boolean;
  verified?: boolean;
}

export type DetailedAvailabilityStatus =
  | 'Working'
  | 'Degraded'
  | 'Unavailable'
  | 'Not tested'
  | 'Authentication required'
  | 'Rate limited';

export interface HealthMatrixRow {
  providerId: string;
  providerName: string;
  providerSlug: string;
  apiEndpoint: string;
  endpointId: string;
  modelName: string;
  capability: string;
  connectionStatus: DetailedAvailabilityStatus;
  lastTestTime: string | null;
  responseTimeMs: number | null;
  successRatePct: number;
  errorRatePct: number;
  freeTierLimits: string;
  currentAvailability: string;
  lastError?: string;
}

export interface EndpointTestResultItem {
  id: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  endpointId: string;
  endpointName: string;
  endpointUrl: string;
  modelName: string;
  capability: string;
  dnsResolved: boolean;
  resolvedAddress?: string;
  httpStatus: number;
  responseTimeMs: number;
  validationPassed: boolean;
  validationDetails: string;
  sampleOutput?: string;
  status: DetailedAvailabilityStatus;
  errorMessage?: string;
  freeTierLimits: string;
  successRatePct: number;
  errorRatePct: number;
  testedAt: string;
}

export interface DiscoveredProviderEvaluationItem {
  providerName: string;
  slug: string;
  officialEndpoint: string;
  supportedModels: string[];
  capabilities: string[];
  authRequirement: string;
  freeTierLimits: string;
  rateLimits: string;
  contextLimits: string;
  imageGenerationAvailable: boolean;
  streamingSupport: boolean;
  commercialUseRestrictions: string;
  tierClassification: 'Keyless Free / Community' | 'Documented Free Tier (API Key)' | 'Limited Trial / Credit';
  currentAvailability: string;
  verifiedByNova: boolean;
}

export interface OpenSourceModelEvaluationItem {
  modelName: string;
  family: string;
  parameters: string;
  capabilities: string[];
  arabicSupport: 'Strong' | 'Moderate' | 'N/A';
  license: string;
  minHardwareEstimate: string;
  canRunOnCurrentNodeHost: boolean;
  hostingReality: string;
}

export interface RouterStatusSummary {
  freeTextCandidates: Array<{ modelId: string; provider: string; score: number; reason: string }>;
  freeImageCandidates: Array<{ modelId: string; provider: string; score: number; reason: string }>;
  freeMultimodalCandidates: Array<{ modelId: string; provider: string; score: number; reason: string }>;
  freeSearchCandidates: Array<{ modelId: string; provider: string; score: number; reason: string }>;
}

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

export interface SupabaseStatusInfo {
  projectUrl: string;
  projectRef: string;
  bucket: string;
  bucketAccess: 'private';
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  configured: boolean;
  keyType: 'service_role' | 'anon' | null;
  bucketReady: boolean;
  message: string;
}

export interface SupabasePlatformStats {
  configured: boolean;
  jobsCount: number | null;
  assetsCount: number | null;
  logsCount: number | null;
  endpointTestsCount: number | null;
}

export interface SourceSearchItem {
  id: string;
  source: string;
  title: string;
  snippet: string;
  url: string;
  meta: string;
  thumbnail?: string;
  videoId?: string;
  channelName?: string;
  duration?: string;
  views?: number;
  publishedAgo?: string;
  embedType?: 'youtube';
  embeddable?: boolean;
}

export interface InspectedMediaMetadata {
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  acceptRanges: boolean;
}

export interface GatewayProviderItem {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiStyle: string;
  authType: 'none' | 'env_api_key' | 'bearer' | 'oauth2';
  capabilities: string[];
  requestMethod: string;
  enabled: boolean;
  healthStatus: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  availabilityStatus?: DetailedAvailabilityStatus;
  lastCheckedAt?: string;
  lastError?: string;
  config: Record<string, unknown>;
  endpoints: Array<{
    id: string;
    name: string;
    method: 'GET' | 'POST';
    path: string;
    contentType: string;
    parameters: Array<{ name: string; location: string; required: boolean; description: string }>;
    capability: string;
    exampleRequest: string;
    verifiedResponseSchema?: string;
    knownLimitations?: string;
    lastTestedAt?: string;
    lastHttpStatus?: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayModelItem {
  id: string;
  name: string;
  providerId: string;
  providerSlug: string;
  modelIdentifier: string;
  capabilities: string[];
  supportedLanguages: string[];
  inputTypes: string[];
  outputTypes: string[];
  streamingSupport: boolean;
  active: boolean;
  verified: boolean;
  tier: 'free' | 'paid';
  description: string;
}

export interface GatewayFallbackRuleItem {
  id: string;
  capability: string;
  primaryProviderSlug: string;
  primaryModelId?: string;
  fallbackProviderSlug: string;
  fallbackModelId: string;
  requireCompatibleIo: boolean;
  priority: number;
  enabled: boolean;
}

export interface GatewayLogItem {
  id: string;
  requestId: string;
  providerSlug: string;
  modelId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  errorClass?: string;
  errorMessage?: string;
  redactedMeta: Record<string, unknown>;
  createdAt: string;
}

export interface SeoScoreCategoryItem {
  category: string;
  score: number;
  maxScore: number;
  deductions: string[];
}

export interface SeoPageItem {
  id: string;
  slug: string;
  path: string;
  pageType: string;
  lang: string;
  hreflangGroup?: string;
  title: string;
  description: string;
  h1: string;
  canonicalUrl: string;
  robots: string;
  status: 'draft' | 'published' | 'archived';
  indexingStatus: string;
  contentMarkdown: string;
  faqs?: Array<{ question: string; answer: string }>;
  internalLinks: Array<{ label: string; path: string }>;
  structuredData: Record<string, unknown>;
  seoScore: number;
  scoreBreakdown: SeoScoreCategoryItem[];
  updatedAt: string;
}

async function parseJsonResponse<T>(resp: Response): Promise<T> {
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `HTTP ${resp.status}`;
    const err = new Error(errMsg) as Error & { code?: string; status?: number };
    if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string') {
      err.code = data.code;
    }
    err.status = resp.status;
    throw err;
  }
  return data as T;
}

function authHeaders(idToken: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${idToken}`,
    ...(extra || {}),
  };
}

export const novaApi = {
  chat: {
    getModels: async () => {
      const resp = await fetch('/api/chat/models');
      return parseJsonResponse<{
        models: ChatModelInfo[];
        config?: {
          freeAiProviderSlug: string;
          freeAiModelId: string;
          freeAiApiStyle: string;
          nezukoBaseUrl: string;
        };
      }>(resp);
    },
  },

  images: {
    getProviders: async () => {
      const resp = await fetch('/api/images/providers');
      return parseJsonResponse<{ providers: ImageProviderInfo[] }>(resp);
    },
    listJobs: async () => {
      const resp = await fetch('/api/images/jobs');
      return parseJsonResponse<{ jobs: ServerImageJob[] }>(resp);
    },
    getJob: async (jobId: string) => {
      const resp = await fetch(`/api/images/jobs/${encodeURIComponent(jobId)}`);
      return parseJsonResponse<{ job: ServerImageJob }>(resp);
    },
    generate: async (payload: {
      prompt: string;
      model: string;
      aspectRatio: string;
      imageSize: string;
    }) => {
      const resp = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ job: ServerImageJob }>(resp);
    },
    enhanceHd: async (url: string) => {
      const resp = await fetch('/api/images/hd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return parseJsonResponse<{ imageDataUrl: string; externalUrl?: string }>(resp);
    },
    analyze: async (imageBase64: string, mimeType: string) => {
      const resp = await fetch('/api/images/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      return parseJsonResponse<{
        recommendation: {
          upscaleFactor?: number;
          sharpness?: number;
          contrast?: number;
          brightness?: number;
          saturation?: number;
          denoise?: number;
          diagnosticSummary?: string;
        };
      }>(resp);
    },
  },

  supabase: {
    getStatus: async () => {
      const resp = await fetch('/api/supabase/status');
      return parseJsonResponse<SupabaseStatusInfo>(resp);
    },
    getSignedUrl: async (storagePath: string, expiresIn = 3600) => {
      const resp = await fetch(
        `/api/supabase/signed-url?path=${encodeURIComponent(storagePath)}&expiresIn=${expiresIn}`
      );
      return parseJsonResponse<{ signedUrl: string; expiresIn: number }>(resp);
    },
  },

  search: {
    web: async (query: string) => {
      const resp = await fetch('/api/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      return parseJsonResponse<{
        answer: string;
        citations: Array<{ title: string; url: string }>;
      }>(resp);
    },
    sources: async (q: string, source: string) => {
      const resp = await fetch(
        `/api/search/sources?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`
      );
      return parseJsonResponse<{ results: SourceSearchItem[]; errors: string[] }>(resp);
    },
  },

  downloader: {
    getFormats: async () => {
      const resp = await fetch('/api/downloader/formats');
      return parseJsonResponse<{
        formats: Array<{ ext: string; mime: string; category: string; status: string }>;
        maxBytes: number;
      }>(resp);
    },
    inspect: async (url: string, mode: 'auto' | 'nezuko' | 'direct') => {
      const resp = await fetch('/api/downloader/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode }),
      });
      return parseJsonResponse<{
        source: 'nezuko' | 'direct';
        metadata: InspectedMediaMetadata;
        variants?: InspectedMediaMetadata[];
      }>(resp);
    },
  },

  gatewayPublic: {
    getCatalog: async () => {
      const resp = await fetch('/api/gateway/catalog');
      return parseJsonResponse<{
        providers: GatewayProviderItem[];
        models: GatewayModelItem[];
      }>(resp);
    },
    getDocs: async () => {
      const resp = await fetch('/api/gateway/docs');
      return parseJsonResponse<{
        generatedAt: string;
        providers: GatewayProviderItem[];
        fallbackRules: GatewayFallbackRuleItem[];
      }>(resp);
    },
    getRouterStatus: async () => {
      const resp = await fetch('/api/gateway/router/status');
      return parseJsonResponse<{
        success: boolean;
        router: RouterStatusSummary;
      }>(resp);
    },
  },

  adminGateway: {
    getOverview: async (idToken: string) => {
      const resp = await fetch('/api/admin/gateway/overview', {
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{
        providers: GatewayProviderItem[];
        models: GatewayModelItem[];
        fallbackRules: GatewayFallbackRuleItem[];
        health: {
          providers: Array<{
            id: string;
            name: string;
            slug: string;
            enabled: boolean;
            healthStatus: string;
            lastCheckedAt?: string;
            lastError?: string;
          }>;
          circuits: Array<{
            providerSlug: string;
            state: 'closed' | 'open' | 'half_open';
            failures: number;
            openUntil: number | null;
          }>;
          usage: {
            totalRequests: number;
            successfulRequests: number;
            failedRequests: number;
            avgDurationMs: number;
            byProvider: Record<string, { total: number; success: number; failed: number; avgDurationMs: number }>;
          };
          recentErrors: GatewayLogItem[];
        };
        usage: {
          totalRequests: number;
          successfulRequests: number;
          failedRequests: number;
          avgDurationMs: number;
          byProvider: Record<string, { total: number; success: number; failed: number; avgDurationMs: number }>;
        };
        supabaseStats?: SupabasePlatformStats;
        docs: { generatedAt: string; providers: GatewayProviderItem[]; fallbackRules: GatewayFallbackRuleItem[] };
      }>(resp);
    },
    getLogs: async (idToken: string, opts?: { provider?: string; errorsOnly?: boolean; q?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.provider) qs.set('provider', opts.provider);
      if (opts?.errorsOnly) qs.set('errorsOnly', 'true');
      if (opts?.q) qs.set('q', opts.q);
      const resp = await fetch(`/api/admin/gateway/logs?${qs.toString()}`, {
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ logs: GatewayLogItem[] }>(resp);
    },
    createProvider: async (idToken: string, payload: Partial<GatewayProviderItem>) => {
      const resp = await fetch('/api/admin/gateway/providers', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ provider: GatewayProviderItem }>(resp);
    },
    updateProvider: async (idToken: string, id: string, payload: Partial<GatewayProviderItem>) => {
      const resp = await fetch(`/api/admin/gateway/providers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ provider: GatewayProviderItem }>(resp);
    },
    testProvider: async (idToken: string, id: string) => {
      const resp = await fetch(`/api/admin/gateway/providers/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{
        result: {
          connected: boolean;
          httpStatus: number;
          durationMs: number;
          validationResult: string;
          sample: string | null;
          error: string | null;
        };
      }>(resp);
    },
    createModel: async (idToken: string, payload: Partial<GatewayModelItem>) => {
      const resp = await fetch('/api/admin/gateway/models', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ model: GatewayModelItem }>(resp);
    },
    updateModel: async (idToken: string, id: string, payload: Partial<GatewayModelItem>) => {
      const resp = await fetch(`/api/admin/gateway/models/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ model: GatewayModelItem }>(resp);
    },
    createFallback: async (idToken: string, payload: Partial<GatewayFallbackRuleItem>) => {
      const resp = await fetch('/api/admin/gateway/fallbacks', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ rule: GatewayFallbackRuleItem }>(resp);
    },
    deleteFallback: async (idToken: string, id: string) => {
      const resp = await fetch(`/api/admin/gateway/fallbacks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ deleted: boolean }>(resp);
    },
    getHealthMatrix: async (idToken: string) => {
      const resp = await fetch('/api/admin/gateway/health-matrix', {
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{
        matrix: HealthMatrixRow[];
        recentTests: EndpointTestResultItem[];
        discoveredProviders: DiscoveredProviderEvaluationItem[];
        openSourceEvaluations: OpenSourceModelEvaluationItem[];
        router: RouterStatusSummary;
      }>(resp);
    },
    testAllEndpoints: async (idToken: string) => {
      const resp = await fetch('/api/admin/gateway/test-all', {
        method: 'POST',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{
        testedAt: string;
        summary: Record<DetailedAvailabilityStatus, number>;
        results: EndpointTestResultItem[];
      }>(resp);
    },
    testProviderEndpoints: async (idToken: string, id: string) => {
      const resp = await fetch(`/api/admin/gateway/providers/${encodeURIComponent(id)}/test-endpoints`, {
        method: 'POST',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ results: EndpointTestResultItem[] }>(resp);
    },
  },

  seoPublic: {
    getCatalog: async () => {
      const resp = await fetch('/api/seo/catalog');
      return parseJsonResponse<{ pages: SeoPageItem[] }>(resp);
    },
    getPage: async (path: string) => {
      const resp = await fetch(`/api/seo/page?path=${encodeURIComponent(path)}`);
      return parseJsonResponse<{
        page: SeoPageItem & {
          alternates: Array<{ hreflang: string; href: string }>;
          langMeta: { code: string; name: string; nativeName: string; dir: 'ltr' | 'rtl'; hreflang: string };
        };
      }>(resp);
    },
    getLanguages: async () => {
      const resp = await fetch('/api/seo/languages');
      return parseJsonResponse<{
        totalLanguages: number;
        languages: Array<{
          code: string;
          name: string;
          nativeName: string;
          dir: 'ltr' | 'rtl';
          hreflang: string;
          publishedPages: number;
          hasPublishedSeo: boolean;
        }>;
      }>(resp);
    },
  },

  adminSeo: {
    getAudit: async (idToken: string) => {
      const resp = await fetch('/api/admin/seo/audit', {
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{
        siteOrigin: string;
        summary: {
          totalPublicPages: number;
          indexablePages: number;
          avgInternalScore: number;
          missingTitles: number;
          missingDescriptions: number;
          duplicateMetadata: number;
          brokenInternalLinks: number;
          missingCanonicals: number;
          invalidHreflang: number;
          missingTranslations: number;
          sitemapErrors: number;
          structuredDataErrors: number;
          thinContentPages: number;
        };
        languageCoverage: Array<{
          code: string;
          name: string;
          nativeName: string;
          dir: 'ltr' | 'rtl';
          hreflang: string;
          publishedPages: number;
          hasPublishedSeo: boolean;
        }>;
        pages: SeoPageItem[];
        redirects: Array<{ id: string; sourcePath: string; targetPath: string; statusCode: number; active: boolean }>;
        automationLogs: Array<{
          id: string;
          jobType: string;
          status: string;
          pagesScanned: number;
          issuesFound: number;
          summary: string;
          createdAt: string;
        }>;
        gsc: {
          siteUrl: string;
          serviceAccountConfigured: boolean;
          clientEmail: string | null;
          message: string;
        };
      }>(resp);
    },
    savePage: async (idToken: string, payload: Partial<SeoPageItem>) => {
      const resp = await fetch('/api/admin/seo/pages', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ page: SeoPageItem }>(resp);
    },
    deletePage: async (idToken: string, id: string, redirectTo?: string) => {
      const qs = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
      const resp = await fetch(`/api/admin/seo/pages/${encodeURIComponent(id)}${qs}`, {
        method: 'DELETE',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ deleted: boolean }>(resp);
    },
    createRedirect: async (idToken: string, payload: { sourcePath: string; targetPath: string; statusCode: number }) => {
      const resp = await fetch('/api/admin/seo/redirects', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ redirect: { id: string } }>(resp);
    },
    deleteRedirect: async (idToken: string, id: string) => {
      const resp = await fetch(`/api/admin/seo/redirects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ deleted: boolean }>(resp);
    },
    runAutomation: async (idToken: string) => {
      const resp = await fetch('/api/admin/seo/automation/run', {
        method: 'POST',
        headers: authHeaders(idToken),
      });
      return parseJsonResponse<{ ok: boolean }>(resp);
    },
    generateAiDraft: async (
      idToken: string,
      payload: {
        topicOrPath: string;
        targetLang: string;
        sourceTitle?: string;
        sourceDescription?: string;
        sourceBody?: string;
      }
    ) => {
      const resp = await fetch('/api/admin/seo/assistant/generate', {
        method: 'POST',
        headers: authHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{
        draft: {
          reviewStatus: 'draft';
          targetLanguage: string;
          providerUsed: string;
          modelUsed: string;
          title: string;
          description: string;
          h1: string;
          contentMarkdown: string;
          faqs: Array<{ question: string; answer: string }>;
          notes: string;
        };
      }>(resp);
    },
    gscAnalytics: async (
      idToken: string,
      payload: { startDate?: string; endDate?: string; dimensions?: Array<'query' | 'page' | 'country' | 'device'> },
      gscAccessToken?: string
    ) => {
      const resp = await fetch('/api/admin/seo/gsc/analytics', {
        method: 'POST',
        headers: authHeaders(idToken, {
          'Content-Type': 'application/json',
          ...(gscAccessToken ? { 'x-gsc-access-token': gscAccessToken } : {}),
        }),
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{
        siteUrl: string;
        startDate: string;
        endDate: string;
        rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
      }>(resp);
    },
    gscSubmitSitemap: async (idToken: string, sitemapUrl?: string, gscAccessToken?: string) => {
      const resp = await fetch('/api/admin/seo/gsc/submit-sitemap', {
        method: 'POST',
        headers: authHeaders(idToken, {
          'Content-Type': 'application/json',
          ...(gscAccessToken ? { 'x-gsc-access-token': gscAccessToken } : {}),
        }),
        body: JSON.stringify({ sitemapUrl }),
      });
      return parseJsonResponse<{ submitted: boolean; sitemapUrl: string; submittedAt: string }>(resp);
    },
    gscInspectUrl: async (idToken: string, inspectionUrl: string, gscAccessToken?: string) => {
      const resp = await fetch('/api/admin/seo/gsc/inspect-url', {
        method: 'POST',
        headers: authHeaders(idToken, {
          'Content-Type': 'application/json',
          ...(gscAccessToken ? { 'x-gsc-access-token': gscAccessToken } : {}),
        }),
        body: JSON.stringify({ inspectionUrl }),
      });
      return parseJsonResponse<{ inspectionResult: Record<string, unknown> | null }>(resp);
    },
  },
};
