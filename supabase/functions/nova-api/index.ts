// Supabase Edge Function: nova-api
// Deployed on project: jlexjqlehjtjzjoqgcwo
// Handles private nova-assets signed URL issuance, asset listing, and health diagnostics.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const BUCKET = 'nova-assets';
const MAX_EXPIRES = 86400;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://jlexjqlehjtjzjoqgcwo.supabase.co';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!serviceRoleKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is missing in Edge Function env.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'health';

  try {
    if (req.method === 'GET' && action === 'health') {
      const { data, error } = await adminClient.storage.getBucket(BUCKET);
      return new Response(
        JSON.stringify({
          success: !error,
          function: 'nova-api',
          bucket: BUCKET,
          bucketReady: Boolean(data),
          error: error?.message ?? null,
          timestamp: new Date().toISOString(),
        }),
        { status: error ? 500 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST' && action === 'signed-url') {
      const body = await req.json().catch(() => ({}));
      const path = typeof body.path === 'string' ? body.path : '';
      const expiresIn = Math.min(MAX_EXPIRES, Math.max(60, Number(body.expiresIn) || 3600));

      if (!/^[a-zA-Z0-9_.\-/]+$/.test(path) || path.includes('..')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid storage path.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message || 'Could not create signed URL.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, signedUrl: data.signedUrl, expiresIn }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET' && action === 'assets') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      const { data, error } = await adminClient
        .from('nova_assets')
        .select('id, job_id, storage_path, mime_type, size_bytes, provider, model, aspect_ratio, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, assets: data ?? [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unsupported action.' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
