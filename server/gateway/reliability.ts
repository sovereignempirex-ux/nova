import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../services/supabaseService.ts';
import type { ApiLogEntry, GatewayError } from './types.ts';

// 1. Secret Redaction
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|secret|token|password|authorization|private[-_]?key|cookie|credential)/i;

export function redactSensitiveString(input: string): string {
  return input
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/((?:^|[\s?&;,])(?:api[-_]?key|key|token|secret|apikey|x-api-key)\s*[=:]\s*)[^\s&;,]+/gi, '$1[REDACTED]')
    .replace(/AIza[0-9A-Za-z\-_]{15,}/g, '[REDACTED_KEY]')
    .replace(/gsk_[0-9A-Za-z\-_]{15,}/g, '[REDACTED_GROQ_KEY]')
    .replace(/hf_[0-9A-Za-z\-_]{15,}/g, '[REDACTED_HF_TOKEN]')
    .replace(/sk-or-v1-[0-9A-Za-z\-_]{15,}/g, '[REDACTED_OR_KEY]');
}

export function redactSensitiveObject(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (typeof value === 'string') return redactSensitiveString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactSensitiveObject(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveObject(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

// 2. Per-IP / Per-User Sliding Window Rate Limiter
const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(
  bucketKey: string,
  maxRequests = 60,
  windowMs = 60_000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (rateBuckets.get(bucketKey) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateBuckets.set(bucketKey, timestamps);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  timestamps.push(now);
  rateBuckets.set(bucketKey, timestamps);
  if (rateBuckets.size > 2000) {
    const firstKey = rateBuckets.keys().next().value;
    if (firstKey) rateBuckets.delete(firstKey);
  }
  return { allowed: true, remaining: Math.max(0, maxRequests - timestamps.length), retryAfterSec: 0 };
}

// 2b. Daily Usage Quota Tracker & Provider Cooldowns (UTC Day)
interface DailyQuotaBucket {
  utcDay: string;
  count: number;
}

const dailyQuotas = new Map<string, DailyQuotaBucket>();
const providerCooldowns = new Map<string, number>();

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkDailyQuota(
  quotaKey: string,
  dailyLimit: number,
  increment = true
): { allowed: boolean; used: number; limit: number; remaining: number } {
  const today = currentUtcDay();
  const existing = dailyQuotas.get(quotaKey);
  const used = existing && existing.utcDay === today ? existing.count : 0;

  if (used >= dailyLimit) {
    return { allowed: false, used, limit: dailyLimit, remaining: 0 };
  }

  const nextUsed = increment ? used + 1 : used;
  if (increment) {
    dailyQuotas.set(quotaKey, { utcDay: today, count: nextUsed });
  }

  return {
    allowed: true,
    used: nextUsed,
    limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - nextUsed),
  };
}

export function setProviderCooldown(providerSlug: string, cooldownSeconds: number) {
  providerCooldowns.set(providerSlug, Date.now() + cooldownSeconds * 1000);
}

export function getProviderCooldownRemainingSec(providerSlug: string): number {
  const until = providerCooldowns.get(providerSlug) || 0;
  if (Date.now() >= until) return 0;
  return Math.ceil((until - Date.now()) / 1000);
}

export function getQuotaSnapshot() {
  const today = currentUtcDay();
  const active: Record<string, { used: number; utcDay: string }> = {};
  for (const [key, bucket] of dailyQuotas.entries()) {
    if (bucket.utcDay === today) {
      active[key] = { used: bucket.count, utcDay: bucket.utcDay };
    }
  }
  return active;
}

// 3. Circuit Breaker per Provider
export interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  lastFailureAt?: string;
  openedUntilMs?: number;
}

const circuits = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 4;
const COOLDOWN_MS = 45_000;

export function getCircuitState(providerSlug: string): CircuitState {
  const current = circuits.get(providerSlug) ?? { state: 'closed', consecutiveFailures: 0 };
  if (current.state === 'open' && current.openedUntilMs && Date.now() >= current.openedUntilMs) {
    const halfOpen: CircuitState = { ...current, state: 'half-open' };
    circuits.set(providerSlug, halfOpen);
    return halfOpen;
  }
  return current;
}

export function canExecuteCircuit(providerSlug: string): boolean {
  const st = getCircuitState(providerSlug);
  return st.state !== 'open';
}

export function recordCircuitSuccess(providerSlug: string): void {
  circuits.set(providerSlug, {
    state: 'closed',
    consecutiveFailures: 0,
  });
}

export function recordCircuitFailure(providerSlug: string): void {
  const current = getCircuitState(providerSlug);
  const failures = current.consecutiveFailures + 1;
  if (failures >= FAILURE_THRESHOLD) {
    circuits.set(providerSlug, {
      state: 'open',
      consecutiveFailures: failures,
      lastFailureAt: new Date().toISOString(),
      openedUntilMs: Date.now() + COOLDOWN_MS,
    });
  } else {
    circuits.set(providerSlug, {
      state: 'closed',
      consecutiveFailures: failures,
      lastFailureAt: new Date().toISOString(),
    });
  }
}

export function getAllCircuitStates(): Record<string, CircuitState> {
  const result: Record<string, CircuitState> = {};
  for (const [slug] of circuits.entries()) {
    result[slug] = getCircuitState(slug);
  }
  return result;
}

// 4. Safe Retries with Exponential Backoff (idempotent requests only)
export async function withSafeRetry<T>(
  operation: () => Promise<T>,
  options: { idempotent: boolean; maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options.idempotent ? Math.min(2, options.maxRetries ?? 2) : 0;
  const baseDelayMs = options.baseDelayMs ?? 350;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const classified = classifyGatewayError(err);
      if (!options.idempotent || !classified.retryable || attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// 5. Error Classification
export function classifyGatewayError(err: unknown, httpStatus?: number): GatewayError {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown upstream error');
  const message = redactSensitiveString(rawMessage);
  const lower = message.toLowerCase();

  if (
    httpStatus === 429 ||
    httpStatus === 402 ||
    lower.includes('rate limit') ||
    lower.includes('free_limit') ||
    lower.includes('not enough tokens') ||
    lower.includes('tokens left') ||
    lower.includes('insufficient_credits') ||
    lower.includes('daily_remaining') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return {
      code: 'UPSTREAM_RATE_LIMIT',
      message,
      classification: 'UPSTREAM_RATE_LIMIT',
      retryable: true,
      status: httpStatus === 402 ? 429 : httpStatus || 429,
    };
  }
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('unauthorized') ||
    lower.includes('token is not configured')
  ) {
    return {
      code: lower.includes('not configured') || lower.includes('missing') ? 'MISSING_CREDENTIALS' : 'UPSTREAM_AUTH_ERROR',
      message,
      classification: lower.includes('not configured') || lower.includes('missing') ? 'MISSING_CREDENTIALS' : 'UPSTREAM_AUTH_ERROR',
      retryable: false,
      status: httpStatus || 401,
    };
  }
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('aborted') ||
    httpStatus === 504
  ) {
    return {
      code: 'UPSTREAM_TIMEOUT',
      message,
      classification: 'UPSTREAM_TIMEOUT',
      retryable: true,
      status: 504,
    };
  }
  if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
    return {
      code: 'VALIDATION_ERROR',
      message,
      classification: 'VALIDATION_ERROR',
      retryable: false,
      status: httpStatus,
    };
  }
  return {
    code: 'UPSTREAM_UNAVAILABLE',
    message,
    classification: 'UPSTREAM_UNAVAILABLE',
    retryable: true,
    status: httpStatus || 502,
  };
}

// 6. Request & Error Logs + Usage Statistics
const logBuffer: ApiLogEntry[] = [];
const MAX_LOGS = 250;

export function recordGatewayLog(
  entry: Omit<ApiLogEntry, 'id' | 'createdAt' | 'redactedMeta'> & { meta?: Record<string, unknown> }
): ApiLogEntry {
  const full: ApiLogEntry = {
    id: randomUUID(),
    requestId: entry.requestId,
    providerSlug: entry.providerSlug,
    modelId: entry.modelId,
    endpoint: redactSensitiveString(entry.endpoint),
    method: entry.method,
    statusCode: entry.statusCode,
    durationMs: Math.round(entry.durationMs),
    success: entry.success,
    errorClass: entry.errorClass,
    errorMessage: entry.errorMessage ? redactSensitiveString(entry.errorMessage).slice(0, 500) : undefined,
    redactedMeta: (redactSensitiveObject(entry.meta || {}) as Record<string, unknown>) || {},
    ipHash: entry.ipHash,
    createdAt: new Date().toISOString(),
  };

  logBuffer.unshift(full);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.length = MAX_LOGS;
  }

  const supa = getSupabaseClient();
  if (supa) {
    void supa
      .from('nova_api_logs')
      .insert({
        request_id: full.requestId,
        provider_slug: full.providerSlug,
        model_key: full.modelId,
        endpoint: full.endpoint,
        method: full.method,
        status_code: full.statusCode,
        duration_ms: full.durationMs,
        success: full.success,
        error_class: full.errorClass || null,
        error_message: full.errorMessage || null,
        redacted_meta: full.redactedMeta,
        ip_hash: full.ipHash || null,
      })
      .then(() => {});
  }

  return full;
}

export function getGatewayLogs(filter?: { providerSlug?: string; errorsOnly?: boolean; limit?: number }): ApiLogEntry[] {
  let list = logBuffer;
  if (filter?.providerSlug) {
    list = list.filter((l) => l.providerSlug === filter.providerSlug);
  }
  if (filter?.errorsOnly) {
    list = list.filter((l) => !l.success);
  }
  return list.slice(0, Math.min(200, filter?.limit ?? 100));
}

export function getUsageStatistics() {
  const total = logBuffer.length;
  const successes = logBuffer.filter((l) => l.success).length;
  const errors = total - successes;
  const avgDurationMs = total > 0 ? Math.round(logBuffer.reduce((s, l) => s + l.durationMs, 0) / total) : 0;

  const byProvider: Record<string, { total: number; success: number; failed: number; avgDurationMs: number }> = {};
  for (const log of logBuffer) {
    if (!byProvider[log.providerSlug]) {
      byProvider[log.providerSlug] = { total: 0, success: 0, failed: 0, avgDurationMs: 0 };
    }
    const p = byProvider[log.providerSlug];
    p.total += 1;
    if (log.success) p.success += 1;
    else p.failed += 1;
    p.avgDurationMs += log.durationMs;
  }
  for (const p of Object.values(byProvider)) {
    p.avgDurationMs = p.total > 0 ? Math.round(p.avgDurationMs / p.total) : 0;
  }

  return {
    totalRequests: total,
    successfulRequests: successes,
    failedRequests: errors,
    successRatePct: total > 0 ? Math.round((successes / total) * 1000) / 10 : 100,
    avgDurationMs,
    byProvider,
    dailyQuotas: getQuotaSnapshot(),
  };
}
