export type ProviderCapability =
  | 'text_generation'
  | 'image_generation'
  | 'image_understanding'
  | 'image_enhancement'
  | 'text-to-image'
  | 'embeddings'
  | 'search'
  | 'media_processing';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export type DetailedAvailabilityStatus =
  | 'Working'
  | 'Degraded'
  | 'Unavailable'
  | 'Not tested'
  | 'Authentication required'
  | 'Rate limited';

export interface FreeTierLimits {
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  dailyNeurons?: number;
  cooldownSeconds?: number;
  monthlyCredits?: string;
  permanentlyFree?: boolean;
  notes: string;
}

export type ErrorClassification =
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_RATE_LIMIT'
  | 'UPSTREAM_AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'CIRCUIT_OPEN'
  | 'MISSING_CREDENTIALS'
  | 'UNSUPPORTED_CAPABILITY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface GatewayEndpointDoc {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  contentType: string;
  parameters: Array<{ name: string; location: 'query' | 'body' | 'formData'; required: boolean; description: string }>;
  capability: ProviderCapability;
  modelName?: string;
  exampleRequest: string;
  verifiedResponseSchema?: string;
  knownLimitations?: string;
  lastTestedAt?: string;
  lastHttpStatus?: number;
  lastResponseTimeMs?: number;
  availabilityStatus?: DetailedAvailabilityStatus;
  successCount?: number;
  errorCount?: number;
}

export interface ProviderRecord {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiStyle: string;
  authType: 'none' | 'env_api_key' | 'bearer' | 'oauth2';
  capabilities: ProviderCapability[];
  requestMethod: 'GET' | 'POST' | 'GET/POST';
  enabled: boolean;
  healthStatus: ProviderHealthStatus;
  availabilityStatus: DetailedAvailabilityStatus;
  freeTierLimits: FreeTierLimits;
  commercialUse: 'allowed' | 'restricted' | 'non_commercial_trial' | 'check_terms';
  contextWindow?: number;
  lastCheckedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
  config: Record<string, unknown>;
  endpoints: GatewayEndpointDoc[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelRecord {
  id: string;
  name: string;
  providerId: string;
  providerSlug: string;
  modelIdentifier: string;
  capabilities: ProviderCapability[];
  supportedLanguages: string[];
  inputTypes: Array<'text' | 'image' | 'url'>;
  outputTypes: Array<'text' | 'image' | 'json' | 'media' | 'embedding'>;
  streamingSupport: boolean;
  contextWindow?: number;
  configSchema: Record<string, unknown>;
  active: boolean;
  verified: boolean;
  tier: 'free' | 'paid';
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FallbackRule {
  id: string;
  capability: ProviderCapability;
  primaryProviderSlug: string;
  primaryModelId?: string;
  fallbackProviderSlug: string;
  fallbackModelId: string;
  requireCompatibleIo: boolean;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayError {
  code: string;
  message: string;
  classification: ErrorClassification;
  retryable: boolean;
  status?: number;
}

export interface GatewayResponse<T = unknown> {
  success: boolean;
  provider: string;
  model: string;
  type: 'text' | 'image' | 'search' | 'media' | 'enhancement' | 'health';
  data: T | null;
  error: GatewayError | null;
  metadata: {
    request_id: string;
    duration_ms: number;
    fallback_used?: boolean;
    fallback_from?: string;
    endpoint?: string;
    timestamp: string;
  };
}

export interface ApiLogEntry {
  id: string;
  requestId: string;
  providerSlug: string;
  modelId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  errorClass?: ErrorClassification;
  errorMessage?: string;
  redactedMeta: Record<string, unknown>;
  ipHash?: string;
  createdAt: string;
}

export interface EndpointTestResult {
  id: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  endpointId: string;
  endpointName: string;
  endpointUrl: string;
  modelName: string;
  capability: ProviderCapability;
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
