import {
  getProviderBySlug,
  listModels,
} from './registry.ts';
import {
  canExecuteCircuit,
  checkDailyQuota,
  getProviderCooldownRemainingSec,
} from './reliability.ts';
import type { ModelRecord, ProviderCapability } from './types.ts';

export interface RouteRequestInput {
  capability: ProviderCapability;
  lang?: string;
  requiresImageInput?: boolean;
  requiresStreaming?: boolean;
  allowPaid?: boolean;
  preferredModelId?: string;
}

export interface RouteCandidate {
  model: ModelRecord;
  providerSlug: string;
  score: number;
  reason: string;
}

function isProviderCredentialsConfigured(providerSlug: string): boolean {
  if (providerSlug === 'google_gemini') return Boolean(process.env.GEMINI_API_KEY?.trim());
  if (providerSlug === 'groq') return Boolean(process.env.GROQ_API_KEY?.trim());
  if (providerSlug === 'openrouter_free') return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if (providerSlug === 'huggingface_inference') return Boolean(process.env.HF_TOKEN?.trim());
  if (providerSlug === 'cloudflare_workers_ai') {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
  }
  return true;
}

export function getFreeRouterCandidates(input: RouteRequestInput): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  const models = listModels({ activeOnly: true });

  for (const m of models) {
    // Skip virtual router models themselves
    if (m.providerSlug === 'nova_router') continue;

    // Never silently switch to paid APIs
    if (m.tier === 'paid' && !input.allowPaid) continue;

    if (!m.capabilities.includes(input.capability)) continue;

    // Enforce strict I/O compatibility: never route image generation to text-only models
    if (
      (input.capability === 'text-to-image' || input.capability === 'image_generation') &&
      !m.outputTypes.includes('image')
    ) {
      continue;
    }

    if (input.requiresImageInput && !m.inputTypes.includes('image')) {
      continue;
    }

    if (input.requiresStreaming && !m.streamingSupport && m.providerSlug !== 'nezuko') {
      continue;
    }

    const provider = getProviderBySlug(m.providerSlug);
    if (!provider || !provider.enabled) continue;

    if (provider.authType === 'env_api_key' && !isProviderCredentialsConfigured(provider.slug)) {
      continue;
    }

    if (!canExecuteCircuit(provider.slug)) continue;
    if (getProviderCooldownRemainingSec(provider.slug) > 0) continue;

    if (
      provider.availabilityStatus === 'Unavailable' ||
      provider.availabilityStatus === 'Authentication required' ||
      provider.availabilityStatus === 'Rate limited'
    ) {
      continue;
    }

    if (provider.freeTierLimits.rpd) {
      const q = checkDailyQuota(`provider:${provider.slug}`, provider.freeTierLimits.rpd, false);
      if (!q.allowed) continue;
    }

    // Never auto-route to known broken/unverified endpoints (like Nezuko Flux/Monte) unless explicitly asked
    if (!m.verified && input.preferredModelId !== m.id) {
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    if (input.preferredModelId && m.id === input.preferredModelId) {
      score += 200;
      reasons.push('preferred');
    }
    if (m.tier === 'free') {
      score += 100;
      reasons.push('free-tier');
    }
    if (provider.availabilityStatus === 'Working') {
      score += 50;
      reasons.push('verified-working');
    } else if (provider.availabilityStatus === 'Degraded') {
      score += 15;
      reasons.push('degraded');
    }
    if (m.streamingSupport) {
      score += 20;
      reasons.push('streaming');
    }
    if (input.lang && m.supportedLanguages.includes(input.lang)) {
      score += 25;
      reasons.push(`lang:${input.lang}`);
    }
    // Prefer reliable keyless free providers when no paid keys are needed
    if (provider.authType === 'none') {
      score += 15;
      reasons.push('keyless');
    }
    if (m.id === 'free_ai_custom:qwen7b') {
      score += 12;
    } else if (m.id === 'pollinations_text:openai') {
      score += 10;
    }

    candidates.push({
      model: m,
      providerSlug: provider.slug,
      score,
      reason: reasons.join(', '),
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function selectBestFreeModel(input: RouteRequestInput): RouteCandidate | null {
  const ranked = getFreeRouterCandidates(input);
  return ranked[0] || null;
}

export function getRouterStatusSummary() {
  return {
    freeTextCandidates: getFreeRouterCandidates({ capability: 'text_generation', lang: 'ar' }).map((c) => ({
      modelId: c.model.id,
      provider: c.providerSlug,
      score: c.score,
      reason: c.reason,
    })),
    freeImageCandidates: getFreeRouterCandidates({ capability: 'text-to-image' }).map((c) => ({
      modelId: c.model.id,
      provider: c.providerSlug,
      score: c.score,
      reason: c.reason,
    })),
    freeMultimodalCandidates: getFreeRouterCandidates({
      capability: 'image_understanding',
      requiresImageInput: true,
    }).map((c) => ({
      modelId: c.model.id,
      provider: c.providerSlug,
      score: c.score,
      reason: c.reason,
    })),
    freeSearchCandidates: getFreeRouterCandidates({ capability: 'search' }).map((c) => ({
      modelId: c.model.id,
      provider: c.providerSlug,
      score: c.score,
      reason: c.reason,
    })),
  };
}
