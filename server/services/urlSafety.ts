import dns from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_MEDIA_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isPrivateIpAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIpAddress(lower.replace('::ffff:', ''));
    return false;
  }
  return true;
}

export async function validatePublicHttpUrl(
  rawUrl: string
): Promise<{ ok: true; parsed: URL } | { ok: false; code: string; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, code: 'INVALID_URL', reason: 'Please enter a valid URL starting with https:// or http://.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, code: 'UNSUPPORTED_SCHEME', reason: 'Only HTTP and HTTPS URLs are allowed.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { ok: false, code: 'BLOCKED_HOST', reason: 'Local or internal hostnames are not permitted.' };
  }

  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      return { ok: false, code: 'BLOCKED_IP', reason: 'Private IP addresses are not permitted.' };
    }
    return { ok: true, parsed };
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0 || records.some((r) => isPrivateIpAddress(r.address))) {
      return { ok: false, code: 'BLOCKED_IP', reason: 'Resolved IP address is restricted or unreachable.' };
    }
  } catch {
    return { ok: false, code: 'DNS_ERROR', reason: `Could not resolve hostname "${host}".` };
  }

  return { ok: true, parsed };
}

export async function safeFetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3
): Promise<Response> {
  const initialCheck = await validatePublicHttpUrl(rawUrl);
  if (!initialCheck.ok) {
    throw new Error(initialCheck.reason);
  }

  let current = initialCheck.parsed;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const resp = await fetch(current.toString(), {
      ...init,
      redirect: 'manual',
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location) return resp;
      const nextUrl = new URL(location, current);
      const nextCheck = await validatePublicHttpUrl(nextUrl.toString());
      if (!nextCheck.ok) {
        throw new Error(nextCheck.reason);
      }
      current = nextCheck.parsed;
      continue;
    }
    return resp;
  }
  throw new Error('Too many redirects while fetching remote asset.');
}

export async function fetchValidatedImageBuffer(
  rawUrl: string,
  maxBytes: number
): Promise<{ buffer: Buffer; mimeType: string; finalUrl: string }> {
  const resp = await safeFetchPublicUrl(rawUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'NOVA-Platform/1.0' },
    signal: AbortSignal.timeout(20000),
  });

  if (!resp.ok) {
    throw new Error(`Image host returned HTTP ${resp.status}`);
  }

  const mime = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MEDIA_IMAGE_MIMES.has(mime)) {
    throw new Error(`Unsupported image MIME type: ${mime || 'unknown'}`);
  }

  const lenHeader = resp.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > maxBytes) {
    throw new Error(`Image exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }

  const arrayBuf = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    throw new Error('Image payload is empty or exceeds maximum allowed size.');
  }

  return {
    buffer,
    mimeType: mime,
    finalUrl: resp.url || rawUrl,
  };
}
