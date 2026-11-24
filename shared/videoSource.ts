export type VideoSourceKind =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'html5_video'
  | 'hls_stream'
  | 'unsupported';

export interface ResolvedVideoSource {
  kind: VideoSourceKind;
  embeddable: boolean;
  providerLabel: string;
  videoId?: string;
  embedUrl?: string;
  streamUrl?: string;
  externalUrl?: string;
  reason?: string;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_REGEX = /^\d{4,15}$/;
const DAILYMOTION_ID_REGEX = /^[A-Za-z0-9]{5,12}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const DAILYMOTION_HOSTS = new Set(['dailymotion.com', 'www.dailymotion.com', 'dai.ly']);

export const APPROVED_VIDEO_FRAME_ORIGINS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.dailymotion.com',
  'https://geo.dailymotion.com',
] as const;

export const NOVA_VIDEO_CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  `frame-src 'self' ${APPROVED_VIDEO_FRAME_ORIGINS.join(' ')} https://*.firebaseapp.com https://accounts.google.com`,
  "connect-src 'self' https: wss: ws:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export function isValidYouTubeId(candidate: string | null | undefined): candidate is string {
  return typeof candidate === 'string' && YOUTUBE_ID_REGEX.test(candidate.trim());
}

export function extractYouTubeVideoId(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_REGEX.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return YOUTUBE_ID_REGEX.test(seg) ? seg : null;
  }

  const vParam = parsed.searchParams.get('v');
  if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
    return vParam;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v')) {
    return YOUTUBE_ID_REGEX.test(parts[1]) ? parts[1] : null;
  }

  return null;
}

export function extractVimeoVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  if (!VIMEO_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (host === 'player.vimeo.com') {
    if (parts[0] === 'video' && parts[1] && VIMEO_ID_REGEX.test(parts[1])) return parts[1];
    return null;
  }
  const last = parts[parts.length - 1] || '';
  return VIMEO_ID_REGEX.test(last) ? last : null;
}

export function extractDailymotionVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  if (!DAILYMOTION_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (host === 'dai.ly' && parts[0] && DAILYMOTION_ID_REGEX.test(parts[0])) {
    return parts[0];
  }
  if (parts[0] === 'video' && parts[1] && DAILYMOTION_ID_REGEX.test(parts[1])) {
    return parts[1];
  }
  if (parts[0] === 'embed' && parts[1] === 'video' && parts[2] && DAILYMOTION_ID_REGEX.test(parts[2])) {
    return parts[2];
  }
  return null;
}

export function resolveVideoSource(
  rawUrlOrId: string,
  options?: {
    mimeType?: string;
    providerHint?: 'youtube' | 'vimeo' | 'dailymotion';
    origin?: string;
  }
): ResolvedVideoSource {
  const trimmed = (rawUrlOrId || '').trim();
  if (!trimmed) {
    return {
      kind: 'unsupported',
      embeddable: false,
      providerLabel: 'Unsupported',
      reason: 'No video URL or identifier was provided.',
    };
  }

  if (options?.providerHint === 'youtube' && isValidYouTubeId(trimmed)) {
    const originParam = options.origin ? `&origin=${encodeURIComponent(options.origin)}` : '';
    return {
      kind: 'youtube',
      embeddable: true,
      providerLabel: 'YouTube',
      videoId: trimmed,
      embedUrl: `https://www.youtube.com/embed/${trimmed}?enablejsapi=1&rel=0&playsinline=1${originParam}`,
      externalUrl: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  if (options?.providerHint === 'dailymotion' && DAILYMOTION_ID_REGEX.test(trimmed)) {
    return {
      kind: 'dailymotion',
      embeddable: true,
      providerLabel: 'Dailymotion',
      videoId: trimmed,
      embedUrl: `https://www.dailymotion.com/embed/video/${trimmed}`,
      externalUrl: `https://www.dailymotion.com/video/${trimmed}`,
    };
  }

  if (options?.providerHint === 'vimeo' && VIMEO_ID_REGEX.test(trimmed)) {
    return {
      kind: 'vimeo',
      embeddable: true,
      providerLabel: 'Vimeo',
      videoId: trimmed,
      embedUrl: `https://player.vimeo.com/video/${trimmed}?dnt=1`,
      externalUrl: `https://vimeo.com/${trimmed}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      kind: 'unsupported',
      embeddable: false,
      providerLabel: 'Unsupported',
      reason: 'Invalid URL format. Provide a valid HTTPS video URL or supported YouTube link.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      kind: 'unsupported',
      embeddable: false,
      providerLabel: 'Unsupported',
      reason: `Blocked unsupported URL scheme "${parsed.protocol}". Only HTTP/HTTPS sources are permitted.`,
    };
  }

  const host = parsed.hostname.toLowerCase();

  // 1. YouTube official embed
  if (YOUTUBE_HOSTS.has(host)) {
    const ytId = extractYouTubeVideoId(trimmed);
    if (!ytId) {
      return {
        kind: 'unsupported',
        embeddable: false,
        providerLabel: 'YouTube',
        externalUrl: parsed.toString(),
        reason: 'Could not extract a valid 11-character YouTube video ID from this URL (channel/playlist URLs are not single videos).',
      };
    }
    const originParam = options?.origin ? `&origin=${encodeURIComponent(options.origin)}` : '';
    return {
      kind: 'youtube',
      embeddable: true,
      providerLabel: 'YouTube',
      videoId: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}?enablejsapi=1&rel=0&playsinline=1${originParam}`,
      externalUrl: `https://www.youtube.com/watch?v=${ytId}`,
    };
  }

  // 2. Vimeo official embed
  if (VIMEO_HOSTS.has(host)) {
    const vimeoId = extractVimeoVideoId(parsed);
    if (!vimeoId) {
      return {
        kind: 'unsupported',
        embeddable: false,
        providerLabel: 'Vimeo',
        externalUrl: parsed.toString(),
        reason: 'Could not extract a valid numeric Vimeo video ID from this URL.',
      };
    }
    return {
      kind: 'vimeo',
      embeddable: true,
      providerLabel: 'Vimeo',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}?dnt=1`,
      externalUrl: `https://vimeo.com/${vimeoId}`,
    };
  }

  // 3. Dailymotion official embed
  if (DAILYMOTION_HOSTS.has(host)) {
    const dmId = extractDailymotionVideoId(parsed);
    if (!dmId) {
      return {
        kind: 'unsupported',
        embeddable: false,
        providerLabel: 'Dailymotion',
        externalUrl: parsed.toString(),
        reason: 'Could not extract a valid Dailymotion video ID from this URL.',
      };
    }
    return {
      kind: 'dailymotion',
      embeddable: true,
      providerLabel: 'Dailymotion',
      videoId: dmId,
      embedUrl: `https://www.dailymotion.com/embed/video/${dmId}`,
      externalUrl: `https://www.dailymotion.com/video/${dmId}`,
    };
  }

  // 4. HLS streams (.m3u8 or HLS MIME)
  const pathnameLower = parsed.pathname.toLowerCase();
  const mimeLower = (options?.mimeType || '').toLowerCase();
  if (
    pathnameLower.endsWith('.m3u8') ||
    mimeLower.includes('application/vnd.apple.mpegurl') ||
    mimeLower.includes('application/x-mpegurl')
  ) {
    return {
      kind: 'hls_stream',
      embeddable: true,
      providerLabel: 'HLS Stream',
      streamUrl: parsed.toString(),
      externalUrl: parsed.toString(),
    };
  }

  // 5. Direct HTML5 video files (.mp4, .webm, .ogg, .ogv, .mov or video/* MIME)
  if (
    pathnameLower.endsWith('.mp4') ||
    pathnameLower.endsWith('.webm') ||
    pathnameLower.endsWith('.ogv') ||
    pathnameLower.endsWith('.ogg') ||
    pathnameLower.endsWith('.mov') ||
    mimeLower === 'video/mp4' ||
    mimeLower === 'video/webm' ||
    mimeLower === 'video/ogg'
  ) {
    return {
      kind: 'html5_video',
      embeddable: true,
      providerLabel: 'Direct HTML5 Video',
      streamUrl: parsed.toString(),
      externalUrl: parsed.toString(),
    };
  }

  // 6. Everything else is explicitly flagged unsupported rather than assumed embeddable
  return {
    kind: 'unsupported',
    embeddable: false,
    providerLabel: host,
    externalUrl: parsed.toString(),
    reason: `Provider "${host}" does not offer a verified NOVA embed integration or direct HTML5/HLS media stream.`,
  };
}

export function formatVideoTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const secStr = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secStr}`;
  }
  return `${minutes}:${secStr}`;
}
