import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { PLATFORM_CONFIG } from './config.ts';
import { fetchValidatedImageBuffer } from './urlSafety.ts';

let cachedClient: SupabaseClient | null = null;

function getSupabaseKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;
}

export function getSupabaseClient(): SupabaseClient | null {
  const key = getSupabaseKey();
  if (!key) return null;
  if (!cachedClient) {
    cachedClient = createClient(PLATFORM_CONFIG.supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

export async function getSupabaseStatus() {
  const key = getSupabaseKey();
  const baseInfo = {
    projectUrl: PLATFORM_CONFIG.supabaseUrl,
    projectRef: PLATFORM_CONFIG.supabaseProjectRef,
    bucket: PLATFORM_CONFIG.supabaseBucket,
    bucketAccess: 'private',
    maxFileSizeBytes: PLATFORM_CONFIG.supabaseMaxBytes,
    allowedMimeTypes: PLATFORM_CONFIG.supabaseAllowedMimeTypes,
    configured: Boolean(key),
    keyType: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'service_role'
      : process.env.SUPABASE_ANON_KEY
      ? 'anon'
      : null,
  };

  if (!key) {
    return {
      ...baseInfo,
      bucketReady: false,
      message:
        'Supabase API key not configured in Settings > Secrets (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).',
    };
  }

  try {
    const client = getSupabaseClient()!;
    const { data, error } = await client.storage.getBucket(PLATFORM_CONFIG.supabaseBucket);
    if (error) {
      return {
        ...baseInfo,
        bucketReady: false,
        message: `Connected to Supabase, bucket check returned: ${error.message}`,
      };
    }
    return {
      ...baseInfo,
      bucketReady: Boolean(data),
      message: 'Connected to Supabase Storage (nova-assets private bucket).',
    };
  } catch (err) {
    return {
      ...baseInfo,
      bucketReady: false,
      message: err instanceof Error ? err.message : 'Unable to verify Supabase bucket.',
    };
  }
}

export async function upsertSupabaseJob(params: {
  id: string;
  jobType: 'image' | 'enhancement' | 'download';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  provider?: string;
  model?: string;
  prompt?: string;
  resultMeta?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    await client.from('nova_jobs').upsert(
      {
        id: params.id,
        job_type: params.jobType,
        status: params.status,
        provider: params.provider || null,
        model_key: params.model || null,
        prompt: params.prompt ? params.prompt.slice(0, 2000) : null,
        result_meta: params.resultMeta || {},
        error_message: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-blocking telemetry persistence
  }
}

export async function getSupabasePlatformStats(): Promise<{
  configured: boolean;
  jobsCount: number | null;
  assetsCount: number | null;
  logsCount: number | null;
  endpointTestsCount: number | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      configured: false,
      jobsCount: null,
      assetsCount: null,
      logsCount: null,
      endpointTestsCount: null,
    };
  }

  try {
    const [jobsRes, assetsRes, logsRes, testsRes] = await Promise.all([
      client.from('nova_jobs').select('*', { count: 'exact', head: true }),
      client.from('nova_assets').select('*', { count: 'exact', head: true }),
      client.from('nova_api_logs').select('*', { count: 'exact', head: true }),
      client.from('nova_api_endpoint_tests').select('*', { count: 'exact', head: true }),
    ]);

    return {
      configured: true,
      jobsCount: typeof jobsRes.count === 'number' ? jobsRes.count : null,
      assetsCount: typeof assetsRes.count === 'number' ? assetsRes.count : null,
      logsCount: typeof logsRes.count === 'number' ? logsRes.count : null,
      endpointTestsCount: typeof testsRes.count === 'number' ? testsRes.count : null,
    };
  } catch {
    return {
      configured: true,
      jobsCount: null,
      assetsCount: null,
      logsCount: null,
      endpointTestsCount: null,
    };
  }
}

export async function storeImageInSupabase(params: {
  sourceUrl?: string;
  base64DataUrl?: string;
  jobId: string;
  prompt: string;
  provider: string;
  model: string;
  aspectRatio: string;
}): Promise<{
  stored: boolean;
  storagePath?: string;
  signedUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      stored: false,
      error: 'Supabase key not configured in Settings > Secrets.',
    };
  }

  try {
    let buffer: Buffer;
    let mimeType: string;

    if (params.base64DataUrl) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(params.base64DataUrl);
      if (!match) {
        return { stored: false, error: 'Unsupported base64 image MIME type for nova-assets bucket.' };
      }
      mimeType = match[1].toLowerCase();
      buffer = Buffer.from(match[2], 'base64');
    } else if (params.sourceUrl) {
      const fetched = await fetchValidatedImageBuffer(
        params.sourceUrl,
        PLATFORM_CONFIG.supabaseMaxBytes
      );
      if (!PLATFORM_CONFIG.supabaseAllowedMimeTypes.includes(fetched.mimeType)) {
        return {
          stored: false,
          error: `MIME type ${fetched.mimeType} not allowed in ${PLATFORM_CONFIG.supabaseBucket} (PNG, JPEG, WebP only).`,
        };
      }
      buffer = fetched.buffer;
      mimeType = fetched.mimeType;
    } else {
      return { stored: false, error: 'No image source provided for upload.' };
    }

    if (buffer.byteLength > PLATFORM_CONFIG.supabaseMaxBytes) {
      return { stored: false, error: 'Image exceeds 25 MB bucket limit.' };
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `generated/${params.jobId}_${randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(PLATFORM_CONFIG.supabaseBucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return { stored: false, error: uploadError.message };
    }

    const { data: signedData, error: signError } = await client.storage
      .from(PLATFORM_CONFIG.supabaseBucket)
      .createSignedUrl(storagePath, 3600);

    // Ensure parent nova_jobs row exists before inserting child nova_assets (FK requirement)
    void upsertSupabaseJob({
      id: params.jobId,
      jobType: 'image',
      status: 'completed',
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      resultMeta: {
        storagePath,
        mimeType,
        sizeBytes: buffer.byteLength,
        aspectRatio: params.aspectRatio,
      },
    }).then(() =>
      client
        .from('nova_assets')
        .insert({
          job_id: params.jobId,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: buffer.byteLength,
          prompt: params.prompt.slice(0, 2000),
          provider: params.provider,
          model: params.model,
          aspect_ratio: params.aspectRatio,
        })
        .then(() => {})
    );

    if (signError) {
      return {
        stored: true,
        storagePath,
        mimeType,
        sizeBytes: buffer.byteLength,
        error: signError.message,
      };
    }

    return {
      stored: true,
      storagePath,
      signedUrl: signedData.signedUrl,
      mimeType,
      sizeBytes: buffer.byteLength,
    };
  } catch (err) {
    return {
      stored: false,
      error: err instanceof Error ? err.message : 'Supabase upload failed.',
    };
  }
}

export async function createTemporarySignedUrl(storagePath: string, expiresInSeconds = 3600) {
  // Confine path to valid alphanumeric/slash pattern inside generated/ prefix
  if (!/^generated\/[a-zA-Z0-9_.-]+$/.test(storagePath) || storagePath.includes('..')) {
    throw new Error('Invalid storage path.');
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase API key is not configured in Settings > Secrets.');
  }

  const { data, error } = await client.storage
    .from(PLATFORM_CONFIG.supabaseBucket)
    .createSignedUrl(storagePath, Math.min(86400, Math.max(60, expiresInSeconds)));

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to generate signed URL.');
  }

  return data.signedUrl;
}
