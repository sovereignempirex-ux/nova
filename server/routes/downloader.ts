import { Router } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { hashIp } from '../middleware/adminAuth.ts';
import { nezukoAdapter } from '../gateway/adapters/nezukoAdapter.ts';
import { executeGatewayCall } from '../gateway/gateway.ts';
import { checkRateLimit } from '../gateway/reliability.ts';
import { safeFetchPublicUrl, validatePublicHttpUrl } from '../services/urlSafety.ts';

export const downloaderRouter = Router();

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB safety ceiling

const PLATFORM_EXTRACTOR_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'twitter.com',
  'x.com',
  'spotify.com',
  'open.spotify.com',
  'twitch.tv',
  'www.twitch.tv',
  'soundcloud.com',
  'facebook.com',
  'www.facebook.com',
];

const SUPPORTED_FORMATS = [
  { ext: 'MP4 / WebM', mime: 'video/mp4, video/webm', category: 'Video', status: 'Direct URL Supported' },
  { ext: 'MP3 / WAV / OGG', mime: 'audio/mpeg, audio/wav, audio/ogg', category: 'Audio', status: 'Direct URL Supported' },
  { ext: 'PNG / JPG / WebP / GIF', mime: 'image/png, image/jpeg, image/webp', category: 'Image', status: 'Direct URL Supported' },
  { ext: 'PDF / JSON / TXT', mime: 'application/pdf, text/plain', category: 'Document', status: 'Direct URL Supported' },
  {
    ext: 'Nezuko Media Extractor',
    mime: '/api/download/all-download-media',
    category: 'Social Platforms',
    status: 'Connected (subject to upstream availability)',
  },
];

function inferFilename(parsed: URL, contentDisposition: string | null, contentType: string): string {
  if (contentDisposition) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(contentDisposition);
    if (match?.[1]) {
      return path.basename(decodeURIComponent(match[1])).replace(/[^a-zA-Z0-9._-]/g, '_');
    }
  }
  const base = path.basename(parsed.pathname);
  if (base && base.includes('.')) {
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
  const extMap: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/json': 'json',
  };
  const cleanMime = contentType.split(';')[0].trim().toLowerCase();
  const ext = extMap[cleanMime] || 'bin';
  return `nova-download.${ext}`;
}

function collectCandidateUrls(obj: unknown, out: Set<string>) {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) out.add(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectCandidateUrls(item, out);
    return;
  }
  if (typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      collectCandidateUrls(val, out);
    }
  }
}

async function inspectSingleDirectUrl(rawUrl: string) {
  let headResp = await safeFetchPublicUrl(rawUrl, {
    method: 'HEAD',
    headers: { 'User-Agent': 'NOVA-Downloader/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (headResp.status === 405 || headResp.status === 403) {
    headResp = await safeFetchPublicUrl(rawUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'NOVA-Downloader/1.0' },
      signal: AbortSignal.timeout(10000),
    });
  }

  if (!headResp.ok && headResp.status !== 206) {
    throw new Error(`Remote server responded with HTTP ${headResp.status} (${headResp.statusText}).`);
  }

  const finalUrl = new URL(headResp.url || rawUrl);
  const contentType = (headResp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const contentLengthHeader = headResp.headers.get('content-length');
  const contentRangeHeader = headResp.headers.get('content-range');
  let sizeBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;

  if (contentRangeHeader) {
    const totalMatch = /\/(\d+)$/.exec(contentRangeHeader);
    if (totalMatch?.[1]) {
      sizeBytes = Number(totalMatch[1]);
    }
  }

  if (contentType.startsWith('text/html')) {
    throw new Error('URL resolves to an HTML webpage rather than a downloadable media file.');
  }

  if (sizeBytes > MAX_DOWNLOAD_BYTES) {
    throw new Error(`File size (${Math.round(sizeBytes / (1024 * 1024))} MB) exceeds the 100 MB platform limit.`);
  }

  const filename = inferFilename(finalUrl, headResp.headers.get('content-disposition'), contentType);
  return {
    url: finalUrl.toString(),
    filename,
    mimeType: contentType,
    sizeBytes,
    acceptRanges: headResp.headers.get('accept-ranges') === 'bytes',
  };
}

downloaderRouter.get('/formats', (_req, res) => {
  res.json({ formats: SUPPORTED_FORMATS, maxBytes: MAX_DOWNLOAD_BYTES });
});

downloaderRouter.post('/inspect', async (req, res) => {
  const { url, mode } = req.body as { url?: string; mode?: 'auto' | 'nezuko' | 'direct' };
  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'URL is required.' });
    return;
  }

  const check = await validatePublicHttpUrl(url);
  if (!check.ok) {
    res.status(400).json({ error: check.reason, code: check.code });
    return;
  }

  const host = check.parsed.hostname.toLowerCase();
  const isSocialHost = PLATFORM_EXTRACTOR_HOSTS.some(
    (h) => host === h || host.endsWith(`.${h}`)
  );

  const ipHash = hashIp(req.ip);
  const directRl = checkRateLimit(`dl_inspect:${ipHash}`, 60, 60_000);
  if (!directRl.allowed) {
    res.setHeader('Retry-After', String(directRl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${directRl.retryAfterSec}s.` });
    return;
  }

  // Route through Nezuko all-download-media via API Gateway if requested or if social/streaming host
  if (mode === 'nezuko' || (mode !== 'direct' && isSocialHost)) {
    const gw = await executeGatewayCall({
      providerSlug: 'nezuko',
      modelId: 'nezuko:media-downloader',
      capability: 'media_processing',
      type: 'media',
      endpoint: `/api/download/all-download-media?url=${encodeURIComponent(check.parsed.toString())}`,
      method: 'GET',
      rateLimitKey: `dl:${ipHash}`,
      ipHash,
      execute: async () => (await nezukoAdapter.downloadMedia(check.parsed.toString())).data!,
    });

    if (!gw.success || !gw.data) {
      res.status(502).json({
        code: 'NEZUKO_UPSTREAM_UNAVAILABLE',
        error: `Nezuko Media Downloader (${gw.metadata.endpoint}) returned status ${gw.error?.status || 502}: ${gw.error?.message || 'upstream error'}. Direct file URLs (.mp4, .mp3, .png, .webp, .pdf) remain supported via Direct mode.`,
        requestId: gw.metadata.request_id,
      });
      return;
    }

    const candidates = new Set<string>();
    collectCandidateUrls(gw.data, candidates);
    const validatedLinks: Array<{
      url: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      acceptRanges: boolean;
    }> = [];

    for (const candidate of Array.from(candidates).slice(0, 4)) {
      try {
        const cCheck = await validatePublicHttpUrl(candidate);
        if (!cCheck.ok) continue;
        const inspected = await inspectSingleDirectUrl(cCheck.parsed.toString());
        validatedLinks.push(inspected);
      } catch {
        // Skip invalid or HTML links from upstream response
      }
    }

    if (validatedLinks.length === 0) {
      res.status(422).json({
        code: 'NO_VALID_MEDIA_RETURNED',
        error: 'Nezuko Media Downloader did not return any validated downloadable media URLs.',
      });
      return;
    }

    res.json({
      source: 'nezuko',
      metadata: validatedLinks[0],
      variants: validatedLinks,
    });
    return;
  }

  try {
    const metadata = await inspectSingleDirectUrl(check.parsed.toString());
    res.json({ source: 'direct', metadata });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to inspect remote media URL.';
    res.status(msg.includes('HTML') ? 422 : 502).json({
      code: msg.includes('HTML') ? 'HTML_PAGE_NOT_MEDIA' : 'FETCH_FAILED',
      error: msg,
    });
  }
});

downloaderRouter.get('/fetch', async (req, res) => {
  const rl = checkRateLimit(`dl_fetch:${hashIp(req.ip)}`, 30, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.` });
    return;
  }

  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const check = await validatePublicHttpUrl(rawUrl);
  if (!check.ok) {
    res.status(400).json({ error: check.reason, code: check.code });
    return;
  }

  try {
    const upstream = await safeFetchPublicUrl(check.parsed.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'NOVA-Downloader/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `Upstream server returned HTTP ${upstream.status}.` });
      return;
    }

    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    if (contentType.startsWith('text/html')) {
      res.status(422).json({ error: 'Target returned an HTML page instead of a media file.' });
      return;
    }

    const lenHeader = upstream.headers.get('content-length');
    const len = lenHeader ? Number(lenHeader) : 0;
    if (len > MAX_DOWNLOAD_BYTES) {
      res.status(413).json({ error: 'File exceeds 100 MB safety limit.' });
      return;
    }

    const finalUrl = new URL(upstream.url || check.parsed.toString());
    const filename = inferFilename(finalUrl, upstream.headers.get('content-disposition'), contentType);

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (len > 0) {
      res.setHeader('Content-Length', String(len));
    }

    const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
    let transferred = 0;

    nodeStream.on('data', (chunk: Buffer) => {
      transferred += chunk.length;
      if (transferred > MAX_DOWNLOAD_BYTES) {
        nodeStream.destroy(new Error('Stream exceeded 100 MB limit'));
      }
    });

    nodeStream.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Download stream interrupted.' });
      } else {
        res.end();
      }
    });

    nodeStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Download failed.' });
    }
  }
});
