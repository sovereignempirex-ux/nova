import { PLATFORM_CONFIG } from '../../services/config.ts';

export interface OpenAiCompatConfig {
  providerSlug: string;
  endpoint: string;
  apiKeyEnvVar: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

export async function streamOpenAiCompatibleChat(
  cfg: OpenAiCompatConfig,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  onDelta: (text: string) => void
): Promise<{ text: string }> {
  const apiKey = (process.env[cfg.apiKeyEnvVar] || '').trim();
  if (!apiKey) {
    const err = new Error(
      `${cfg.apiKeyEnvVar} is not configured in Settings > Secrets.`
    ) as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const resp = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(cfg.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages,
    }),
    signal: AbortSignal.timeout(PLATFORM_CONFIG.requestTimeoutMs),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const err = new Error(
      `${cfg.providerSlug} returned HTTP ${resp.status}: ${body.slice(0, 200) || resp.statusText}`
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }

  if (!resp.body) {
    throw new Error(`${cfg.providerSlug} returned an empty response body.`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          text += delta;
          onDelta(delta);
        }
      } catch {
        // Ignore partial chunk
      }
    }
  }

  if (!text.trim()) {
    throw new Error(`${cfg.providerSlug} stream completed with empty output.`);
  }

  return { text };
}

export async function runCloudflareWorkersAiChat(
  model: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): Promise<{ text: string }> {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    const err = new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not configured in Settings > Secrets.'
    ) as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(PLATFORM_CONFIG.requestTimeoutMs),
  });

  const json = (await resp.json().catch(() => null)) as {
    success?: boolean;
    result?: { response?: string };
    errors?: Array<{ message?: string }>;
  } | null;

  if (!resp.ok || !json?.success || !json.result?.response) {
    const err = new Error(
      json?.errors?.[0]?.message || `Cloudflare Workers AI returned HTTP ${resp.status}.`
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }

  return { text: json.result.response };
}
