import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RectangleHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatVideoTime, resolveVideoSource } from '../../shared/videoSource';

export interface NovaPlayableVideo {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  channelName?: string;
  duration?: string;
  views?: number;
  publishedAgo?: string;
  description?: string;
  mimeType?: string;
  providerHint?: 'youtube' | 'vimeo' | 'dailymotion';
}

interface NovaVideoPlayerProps {
  video: NovaPlayableVideo;
  relatedVideos?: NovaPlayableVideo[];
  onSelectRelated?: (video: NovaPlayableVideo) => void;
  onBack?: () => void;
  backLabel?: string;
  autoPlayOnUserSelect?: boolean;
  compact?: boolean;
}

interface YtPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YtNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (ev: { target: YtPlayerInstance }) => void;
        onStateChange?: (ev: { data: number; target: YtPlayerInstance }) => void;
        onError?: (ev: { data: number }) => void;
      };
    }
  ) => YtPlayerInstance;
  PlayerState?: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YtNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requires a browser environment.'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YtNamespace>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube IFrame API timed out.'));
    }, 5500);

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      if (prevCallback) {
        try {
          prevCallback();
        } catch {
          // ignore downstream listener error
        }
      }
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        ytApiPromise = null;
        reject(new Error('YouTube IFrame API initialized without Player constructor.'));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script.'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

function mapYouTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Invalid YouTube video identifier.';
    case 5:
      return 'This video could not be decoded by the browser HTML5 player.';
    case 100:
      return 'This video is unavailable, private, or has been removed by the uploader.';
    case 101:
    case 150:
      return 'The video owner has restricted embedded playback outside YouTube. NOVA respects provider embedding rules; you can open the original link below if desired.';
    default:
      return `Embedded playback failed (provider code ${code}).`;
  }
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const NovaVideoPlayer: React.FC<NovaVideoPlayerProps> = ({
  video,
  relatedVideos = [],
  onSelectRelated,
  onBack,
  backLabel = 'Back to Search Results',
  autoPlayOnUserSelect = false,
  compact = false,
}) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const resolved = useMemo(
    () =>
      resolveVideoSource(video.url, {
        mimeType: video.mimeType,
        providerHint: video.providerHint,
        origin,
      }),
    [video.url, video.mimeType, video.providerHint, origin]
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YtPlayerInstance | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ytNativeFallback, setYtNativeFallback] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(85);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [theaterMode, setTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [brokenRelatedThumbs, setBrokenRelatedThumbs] = useState<Record<string, boolean>>({});

  // Reset playback state whenever the active video changes
  useEffect(() => {
    setLoading(resolved.embeddable);
    setBuffering(false);
    setErrorMsg(resolved.embeddable ? null : resolved.reason || 'This video source cannot be embedded.');
    setYtNativeFallback(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
    setPlaybackRate(1);
  }, [video.id, video.url, resolved.embeddable, resolved.reason]);

  // Listen to fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Mount Official YouTube IFrame Player API
  useEffect(() => {
    if (resolved.kind !== 'youtube' || !resolved.videoId || ytNativeFallback) return;

    let cancelled = false;
    let pollTimer: number | null = null;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !ytHostRef.current) return;
        ytHostRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        mountNode.className = 'w-full h-full';
        ytHostRef.current.appendChild(mountNode);

        const player = new YT.Player(mountNode, {
          videoId: resolved.videoId!,
          host: 'https://www.youtube.com',
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: autoPlayOnUserSelect ? 1 : 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev) => {
              if (cancelled) return;
              ytPlayerRef.current = ev.target;
              setLoading(false);
              setDuration(ev.target.getDuration() || 0);
              ev.target.setVolume(volume);
              if (muted) ev.target.mute();
              else ev.target.unMute();
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              const state = ev.data;
              // 1: PLAYING, 2: PAUSED, 3: BUFFERING, 0: ENDED
              if (state === 1) {
                setIsPlaying(true);
                setBuffering(false);
                setLoading(false);
                setDuration(ev.target.getDuration() || 0);
              } else if (state === 2 || state === 0) {
                setIsPlaying(false);
                setBuffering(false);
              } else if (state === 3) {
                setBuffering(true);
              }
            },
            onError: (ev) => {
              if (cancelled) return;
              setLoading(false);
              setBuffering(false);
              setIsPlaying(false);
              setErrorMsg(mapYouTubeErrorMessage(ev.data));
            },
          },
        });

        ytPlayerRef.current = player;

        pollTimer = window.setInterval(() => {
          const p = ytPlayerRef.current;
          if (!p) return;
          try {
            const ct = p.getCurrentTime();
            const dur = p.getDuration();
            if (Number.isFinite(ct)) setCurrentTime(ct);
            if (Number.isFinite(dur) && dur > 0) setDuration(dur);
          } catch {
            // Player destroyed during unmount
          }
        }, 400);
      })
      .catch(() => {
        if (cancelled) return;
        // Graceful fallback to official embed iframe with native controls
        setYtNativeFallback(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.kind, resolved.videoId, ytNativeFallback, autoPlayOnUserSelect]);

  // Mount Direct HTML5 Video or HLS Stream
  useEffect(() => {
    if (resolved.kind !== 'html5_video' && resolved.kind !== 'hls_stream') return;
    const videoEl = htmlVideoRef.current;
    if (!videoEl || !resolved.streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (resolved.kind === 'hls_stream') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(resolved.streamUrl);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          if (autoPlayOnUserSelect) {
            void videoEl.play().catch(() => {
              // Browser prevented unmuted autoplay; user can click play
            });
          }
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) {
            setLoading(false);
            setBuffering(false);
            setErrorMsg(
              `HLS stream failed (${data.details || 'manifest or network error'}). Verify CORS and stream availability.`
            );
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = resolved.streamUrl;
      } else {
        setLoading(false);
        setErrorMsg('Your browser does not support HLS (.m3u8) video playback.');
      }
    } else {
      videoEl.src = resolved.streamUrl;
      if (autoPlayOnUserSelect) {
        void videoEl.play().catch(() => {
          // Browser prevented unmuted autoplay; user can click play
        });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [resolved.kind, resolved.streamUrl, autoPlayOnUserSelect]);

  const togglePlay = useCallback(() => {
    if (errorMsg) return;
    if (resolved.kind === 'youtube' && ytPlayerRef.current) {
      if (isPlaying) ytPlayerRef.current.pauseVideo();
      else ytPlayerRef.current.playVideo();
      return;
    }
    const el = htmlVideoRef.current;
    if (el) {
      if (el.paused) {
        void el.play().catch(() => {
          setErrorMsg('Playback could not start. Click play again or inspect media format.');
        });
      } else {
        el.pause();
      }
    }
  }, [errorMsg, resolved.kind, isPlaying]);

  const seekTo = useCallback(
    (nextTime: number) => {
      const clamped = Math.max(0, duration > 0 ? Math.min(duration, nextTime) : nextTime);
      setCurrentTime(clamped);
      if (resolved.kind === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(clamped, true);
        return;
      }
      if (htmlVideoRef.current) {
        htmlVideoRef.current.currentTime = clamped;
      }
    },
    [duration, resolved.kind]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (resolved.kind === 'youtube' && ytPlayerRef.current) {
      if (nextMuted) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
      return;
    }
    if (htmlVideoRef.current) {
      htmlVideoRef.current.muted = nextMuted;
    }
  }, [muted, resolved.kind]);

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      setVolume(nextVol);
      const shouldMute = nextVol === 0;
      setMuted(shouldMute);
      if (resolved.kind === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.setVolume(nextVol);
        if (shouldMute) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
        return;
      }
      if (htmlVideoRef.current) {
        htmlVideoRef.current.volume = nextVol / 100;
        htmlVideoRef.current.muted = shouldMute;
      }
    },
    [resolved.kind]
  );

  const handleSpeedChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      if (resolved.kind === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.setPlaybackRate(rate);
        return;
      }
      if (htmlVideoRef.current) {
        htmlVideoRef.current.playbackRate = rate;
      }
    },
    [resolved.kind]
  );

  const toggleFullscreen = useCallback(async () => {
    const container = stageRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (htmlVideoRef.current && 'webkitEnterFullscreen' in htmlVideoRef.current) {
        (htmlVideoRef.current as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      }
    } catch {
      // ignore fullscreen rejection on restricted platforms
    }
  }, []);

  // Keyboard shortcuts when focus isn't inside an input/textarea/select
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (e.key === 'Escape' && onBack && !document.fullscreenElement) {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key.toLowerCase() === 't' && !compact) {
        e.preventDefault();
        setTheaterMode((v) => !v);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(currentTime + 5);
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        seekTo(currentTime - 10);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        seekTo(currentTime + 10);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack, togglePlay, toggleMute, toggleFullscreen, compact, seekTo, currentTime]);

  const showUnifiedBar =
    !errorMsg &&
    ((resolved.kind === 'youtube' && !ytNativeFallback) ||
      resolved.kind === 'html5_video' ||
      resolved.kind === 'hls_stream');

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0;

  return (
    <section
      aria-label="NOVA Embedded Video Player"
      className={`rounded-2xl border border-slate-800 bg-[#07090F] text-slate-100 overflow-hidden ${
        theaterMode ? 'w-full' : ''
      }`}
    >
      {/* Top Cinematic Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-[#0B0F17]">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-xs font-semibold text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{backLabel}</span>
            </button>
          )}
          <span className="text-xs text-slate-400 truncate">
            {resolved.providerLabel} · Embedded Playback
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!compact && (
            <button
              type="button"
              onClick={() => setTheaterMode((v) => !v)}
              aria-pressed={theaterMode}
              title="Toggle theater mode (T)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700/90 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RectangleHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{theaterMode ? 'Default View' : 'Theater'}</span>
            </button>
          )}

          {resolved.externalUrl && (
            <a
              href={resolved.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700/90 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <span>External Link</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {/* Main Responsive Stage + Related Sidebar */}
      <div className={`grid grid-cols-1 ${relatedVideos.length > 0 && !theaterMode ? 'lg:grid-cols-12' : ''}`}>
        <div className={relatedVideos.length > 0 && !theaterMode ? 'lg:col-span-8 xl:col-span-9' : 'col-span-1'}>
          {/* 16:9 Video Stage */}
          <div ref={stageRef} className="relative w-full aspect-video bg-black overflow-hidden">
            {errorMsg ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#090B10] space-y-4">
                <AlertCircle className="w-10 h-10 text-red-400" aria-hidden="true" />
                <div className="max-w-md space-y-1.5">
                  <p className="text-sm font-semibold text-white">Unable to Play Video Inside NOVA</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{errorMsg}</p>
                </div>
                {resolved.externalUrl && (
                  <a
                    href={resolved.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
                  >
                    <span>Open on Provider Site</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            ) : resolved.kind === 'youtube' ? (
              ytNativeFallback && resolved.embedUrl ? (
                <iframe
                  src={resolved.embedUrl.replace('controls=0', 'controls=1')}
                  title={video.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setLoading(false)}
                />
              ) : (
                <>
                  <div ref={ytHostRef} className="w-full h-full" />
                  {/* Click overlay to toggle play/pause cleanly over the frameless YT player */}
                  {!loading && (
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      className="absolute inset-0 w-full h-full bg-transparent cursor-pointer focus:outline-none flex items-center justify-center group"
                    >
                      {!isPlaying && !buffering && (
                        <span className="w-16 h-16 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                          <Play className="w-7 h-7 ms-0.5" fill="currentColor" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  )}
                </>
              )
            ) : resolved.kind === 'vimeo' || resolved.kind === 'dailymotion' ? (
              <iframe
                src={resolved.embedUrl}
                title={video.title}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setLoading(false)}
              />
            ) : (
              <>
                <video
                  ref={htmlVideoRef}
                  playsInline
                  preload="metadata"
                  poster={video.thumbnail}
                  onClick={togglePlay}
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    setDuration(Number.isFinite(el.duration) ? el.duration : 0);
                    el.volume = volume / 100;
                    el.muted = muted;
                  }}
                  onCanPlay={() => {
                    setLoading(false);
                    setBuffering(false);
                  }}
                  onWaiting={() => setBuffering(true)}
                  onPlaying={() => {
                    setIsPlaying(true);
                    setBuffering(false);
                    setLoading(false);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onProgress={(e) => {
                    const el = e.currentTarget;
                    if (el.buffered.length > 0) {
                      setBufferedEnd(el.buffered.end(el.buffered.length - 1));
                    }
                  }}
                  onError={() => {
                    setLoading(false);
                    setBuffering(false);
                    setErrorMsg('Browser could not load or decode this video stream.');
                  }}
                  className="w-full h-full object-contain bg-black cursor-pointer"
                />
                {!loading && !isPlaying && !buffering && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label="Play video"
                    className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors"
                  >
                    <span className="w-16 h-16 rounded-full bg-black/75 border border-white/20 flex items-center justify-center text-white">
                      <Play className="w-7 h-7 ms-0.5" fill="currentColor" aria-hidden="true" />
                    </span>
                  </button>
                )}
              </>
            )}

            {/* Loading Skeleton / Buffering Indicator */}
            {(loading || buffering) && !errorMsg && (
              <div
                aria-live="polite"
                className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/55 backdrop-blur-[1px] gap-2"
              >
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" aria-hidden="true" />
                <span className="text-xs font-medium text-slate-200">
                  {loading ? 'Loading embedded player...' : 'Buffering stream...'}
                </span>
              </div>
            )}
          </div>

          {/* Unified NOVA Control Bar */}
          {showUnifiedBar && (
            <div className="bg-[#0B0F17] border-t border-slate-800/80 px-3 sm:px-4 py-2.5 space-y-2">
              {/* Interactive Seek / Progress Bar */}
              <div className="relative flex items-center h-5 group">
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 start-0 bg-slate-600/70"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 start-0 bg-blue-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <input
                  type="range"
                  aria-label="Seek video timeline"
                  min={0}
                  max={duration > 0 ? duration : 100}
                  step={0.5}
                  value={Math.min(currentTime, duration || 100)}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  disabled={duration <= 0}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                />
              </div>

              {/* Action Controls Row (mobile-friendly touch targets) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-100 hover:bg-slate-800 transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Play className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <input
                    type="range"
                    aria-label="Volume"
                    min={0}
                    max={100}
                    value={muted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="hidden sm:block w-20 accent-blue-500 cursor-pointer"
                  />

                  <span className="font-mono text-xs tabular-nums text-slate-300 ms-1">
                    {formatVideoTime(currentTime)} / {duration > 0 ? formatVideoTime(duration) : video.duration || '0:00'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label htmlFor={`speed-${video.id}`} className="sr-only">
                    Playback speed
                  </label>
                  <select
                    id={`speed-${video.id}`}
                    aria-label="Playback speed"
                    value={playbackRate}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SPEED_OPTIONS.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}x
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    title="Fullscreen (F)"
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Maximize2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Video Information Below Player */}
          <div className="p-4 sm:p-6 space-y-3 border-t border-slate-800/80 bg-[#0B0F17]">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-white text-balance">
              {video.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              {video.channelName && <span className="font-medium text-slate-200">{video.channelName}</span>}
              {video.channelName && (video.views || video.publishedAgo || video.duration) && (
                <span aria-hidden="true">·</span>
              )}
              {typeof video.views === 'number' && (
                <span>{video.views.toLocaleString()} views</span>
              )}
              {typeof video.views === 'number' && video.publishedAgo && <span aria-hidden="true">·</span>}
              {video.publishedAgo && <span>{video.publishedAgo}</span>}
              {(video.views || video.publishedAgo) && video.duration && <span aria-hidden="true">·</span>}
              {video.duration && <span>Duration {video.duration}</span>}
            </div>
            {video.description && (
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                {video.description}
              </p>
            )}
            {showUnifiedBar && (
              <p className="text-[11px] text-slate-500 pt-1">
                Shortcuts: Space / K Play-Pause · ← / → Seek 5s · M Mute · F Fullscreen{!compact ? ' · T Theater' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Related Videos Column */}
        {relatedVideos.length > 0 && (
          <aside
            className={`${
              theaterMode
                ? 'col-span-1 border-t border-slate-800/80 p-4 sm:p-6'
                : 'lg:col-span-4 xl:col-span-3 border-t lg:border-t-0 lg:border-s border-slate-800/80 p-4'
            } bg-[#080B12] space-y-3 max-h-[600px] overflow-y-auto`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200">Up Next &amp; Related Videos</h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">{relatedVideos.length}</span>
            </div>

            <div className={theaterMode ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3' : 'space-y-2.5'}>
              {relatedVideos.map((rel) => {
                const isActive = rel.id === video.id;
                const thumbBroken = brokenRelatedThumbs[rel.id];
                return (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => onSelectRelated?.(rel)}
                    className={`w-full text-start rounded-xl border p-2.5 transition-colors flex gap-3 ${
                      isActive
                        ? 'border-blue-500/80 bg-blue-500/10'
                        : 'border-slate-800/90 bg-[#0D1119] hover:border-slate-700'
                    }`}
                  >
                    <div className="w-24 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0 relative flex items-center justify-center">
                      {rel.thumbnail && !thumbBroken ? (
                        <img
                          src={rel.thumbnail}
                          alt={rel.title}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenRelatedThumbs((p) => ({ ...p, [rel.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-4 h-4 text-slate-600" aria-hidden="true" />
                      )}
                      {rel.duration && (
                        <span className="absolute bottom-1 end-1 px-1 py-0.5 rounded bg-black/80 font-mono text-[10px] tabular-nums text-white">
                          {rel.duration}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
                        {rel.title}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[rel.channelName, rel.publishedAgo].filter(Boolean).join(' · ') || 'Video'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
};
