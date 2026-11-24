import { createSign } from 'node:crypto';
import { getSupabaseClient } from '../services/supabaseService.ts';

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getGscConfigStatus() {
  const siteUrl = process.env.GSC_SITE_URL || 'https://nova.vanitasbot.my.id/';
  const clientEmail = (process.env.GSC_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const serviceAccountConfigured = Boolean(clientEmail && privateKey.includes('BEGIN'));

  return {
    siteUrl,
    serviceAccountConfigured,
    clientEmail: clientEmail || null,
    message: serviceAccountConfigured
      ? 'Google Search Console Service Account configured.'
      : 'GSC_CLIENT_EMAIL / GSC_PRIVATE_KEY are not set in Settings > Secrets. You may configure Service Account credentials or pass a verified Search Console OAuth token.',
  };
}

async function mintServiceAccountAccessToken(): Promise<string> {
  const clientEmail = (process.env.GSC_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    throw new Error('GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY must be configured in Settings > Secrets.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/webmasters',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = `${signingInput}.${signature}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(12000),
  });

  const tokenJson = (await tokenResp.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!tokenResp.ok || !tokenJson?.access_token) {
    throw new Error(
      tokenJson?.error_description || tokenJson?.error || `Google OAuth token exchange failed (${tokenResp.status}).`
    );
  }
  return tokenJson.access_token;
}

async function resolveAccessToken(bearerOverride?: string): Promise<string> {
  if (bearerOverride && bearerOverride.trim().length > 10) {
    return bearerOverride.trim();
  }
  return mintServiceAccountAccessToken();
}

export async function querySearchAnalytics(params: {
  startDate: string;
  endDate: string;
  dimensions?: Array<'query' | 'page' | 'country' | 'device'>;
  rowLimit?: number;
  oauthAccessToken?: string;
}) {
  const { siteUrl } = getGscConfigStatus();
  const accessToken = await resolveAccessToken(params.oauthAccessToken);

  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions || ['query'],
      rowLimit: params.rowLimit || 50,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await resp.json().catch(() => null)) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    error?: { message?: string; code?: number };
  } | null;

  if (!resp.ok) {
    throw new Error(json?.error?.message || `Search Console API returned HTTP ${resp.status}.`);
  }

  const rows = json?.rows || [];
  const supa = getSupabaseClient();
  if (supa) {
    void supa
      .from('nova_gsc_snapshots')
      .insert({
        site_url: siteUrl,
        date_range_start: params.startDate,
        date_range_end: params.endDate,
        dimensions: params.dimensions || ['query'],
        rows,
      })
      .then(() => {});
  }

  return {
    siteUrl,
    startDate: params.startDate,
    endDate: params.endDate,
    rows,
  };
}

export async function submitSitemapToGsc(sitemapUrl?: string, oauthAccessToken?: string) {
  const { siteUrl } = getGscConfigStatus();
  const origin = siteUrl.replace(/\/+$/, '');
  const targetSitemap = sitemapUrl || `${origin}/sitemap.xml`;
  const accessToken = await resolveAccessToken(oauthAccessToken);

  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(targetSitemap)}`;
  const resp = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const errJson = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errJson?.error?.message || `Sitemap submission failed (${resp.status}).`);
  }

  return {
    submitted: true,
    siteUrl,
    sitemapUrl: targetSitemap,
    submittedAt: new Date().toISOString(),
  };
}

export async function inspectUrlInGsc(inspectionUrl: string, oauthAccessToken?: string) {
  const { siteUrl } = getGscConfigStatus();
  const accessToken = await resolveAccessToken(oauthAccessToken);

  const resp = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl,
      languageCode: 'en-US',
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await resp.json().catch(() => null)) as {
    inspectionResult?: Record<string, unknown>;
    error?: { message?: string };
  } | null;

  if (!resp.ok) {
    throw new Error(json?.error?.message || `URL inspection failed (${resp.status}).`);
  }

  return {
    inspectionUrl,
    siteUrl,
    inspectionResult: json?.inspectionResult || null,
  };
}
