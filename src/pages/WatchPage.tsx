import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, ShieldAlert, Video } from 'lucide-react';
import { NovaPlayableVideo, NovaVideoPlayer } from '../components/NovaVideoPlayer';
import { usePageMeta } from '../hooks/usePageMeta';
import { useLanguage } from '../lib/LanguageContext';
import { resolveVideoSource } from '../../shared/videoSource';

interface SampleVideoPreset {
  id: string;
  label: string;
  title: string;
  url: string;
  providerHint?: 'youtube' | 'vimeo' | 'dailymotion';
  description: string;
}

const TEST_PRESETS: SampleVideoPreset[] = [
  {
    id: 'preset-yt',
    label: 'YouTube Official IFrame',
    title: 'YouTube Official Player API Demo',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    providerHint: 'youtube',
    description: 'Official YouTube IFrame Player API playback with custom NOVA timeline, speed, and fullscreen controls.',
  },
  {
    id: 'preset-mp4',
    label: 'Direct MP4 (HTML5)',
    title: 'Sample MP4 Video Stream',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    description: 'Direct CC0 HTML5 MP4 video stream with seekable timeline, volume control, and speed selector.',
  },
  {
    id: 'preset-hls',
    label: 'HLS Stream (.m3u8)',
    title: 'Adaptive HLS Test Stream',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    description: 'Adaptive HTTP Live Streaming (.m3u8) played cleanly inside NOVA via hls.js or native browser HLS.',
  },
  {
    id: 'preset-unsupported',
    label: 'Unsupported Host Check',
    title: 'Unsupported External Website',
    url: 'https://github.com/sovereignempirex-ux/nova',
    description: 'Demonstrates honest detection when an external link does not provide an embeddable video stream.',
  },
];

export const WatchPage: React.FC = () => {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramV = searchParams.get('v')?.trim() || '';
  const paramUrl = searchParams.get('url')?.trim() || '';
  const paramTitle = searchParams.get('title')?.trim() || '';

  const initialSourceUrl = paramUrl || (paramV ? `https://www.youtube.com/watch?v=${paramV}` : TEST_PRESETS[1].url);
  const initialTitle = paramTitle || (paramV ? `YouTube Video (${paramV})` : paramUrl ? 'Embedded Media Stream' : TEST_PRESETS[1].title);

  const [urlInput, setUrlInput] = useState(initialSourceUrl);
  const [activeVideo, setActiveVideo] = useState<NovaPlayableVideo>({
    id: `watch-${initialSourceUrl}`,
    title: initialTitle,
    url: initialSourceUrl,
    providerHint: paramV ? 'youtube' : undefined,
  });
  // Direct page loads must never autoplay with sound without an explicit user gesture
  const [autoPlayOnSelect, setAutoPlayOnSelect] = useState(false);

  const sourcePreview = useMemo(() => resolveVideoSource(activeVideo.url, { providerHint: activeVideo.providerHint }), [activeVideo]);

  usePageMeta(
    `${activeVideo.title} — NOVA Video Player`,
    'Watch YouTube, Vimeo, Dailymotion, Direct HTML5 MP4/WebM, and HLS streams directly inside NOVA.',
    '/watch'
  );

  const loadVideoUrl = (nextUrl: string, nextTitle?: string, hint?: 'youtube' | 'vimeo' | 'dailymotion') => {
    const clean = nextUrl.trim();
    if (!clean) return;
    setUrlInput(clean);
    setAutoPlayOnSelect(true);
    setActiveVideo({
      id: `watch-${clean}-${Date.now()}`,
      title: nextTitle || 'Embedded Video Playback',
      url: clean,
      providerHint: hint,
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('v');
        next.set('url', clean);
        if (nextTitle) next.set('title', nextTitle);
        else next.delete('title');
        return next;
      },
      { replace: true }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadVideoUrl(urlInput);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/search" className="inline-flex items-center gap-1 hover:text-blue-500 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
              <span>Back to Search</span>
            </Link>
            <span aria-hidden="true">·</span>
            <span>NOVA Embedded Player</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {t('watchHeading')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('watchSubheading')}
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Video className="w-4 h-4 text-blue-500" aria-hidden="true" />
          <span>
            Detected source: <strong className="text-slate-800 dark:text-slate-200">{sourcePreview.providerLabel}</strong>{' '}
            ({sourcePreview.embeddable ? 'Embeddable' : 'Unsupported'})
          </span>
        </div>
      </header>

      {/* URL Loader + Presets */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="watch-url-input" className="sr-only">
            Video URL or YouTube ID
          </label>
          <input
            id="watch-url-input"
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a YouTube, Vimeo, Dailymotion, .mp4, .webm, or .m3u8 URL..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!urlInput.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            <span>Load Video</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 me-1">Quick test sources:</span>
          {TEST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadVideoUrl(preset.url, preset.title, preset.providerHint)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                activeVideo.url === preset.url
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {!sourcePreview.embeddable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{sourcePreview.reason}</span>
        </div>
      )}

      <NovaVideoPlayer
        video={activeVideo}
        relatedVideos={TEST_PRESETS.map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url,
          providerHint: p.providerHint,
          channelName: p.label,
          description: p.description,
        }))}
        onSelectRelated={(rel) => loadVideoUrl(rel.url, rel.title, rel.providerHint)}
        onBack={() => navigate('/search')}
        backLabel="Back to Search"
        autoPlayOnUserSelect={autoPlayOnSelect}
      />
    </div>
  );
};
