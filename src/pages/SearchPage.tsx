import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  AlertCircle,
  ArrowUpRight,
  Compass,
  Image as ImageIcon,
  Loader2,
  Play,
  Search as SearchIcon,
  Video,
} from 'lucide-react';
import { SourceSearchItem, novaApi } from '../lib/apiClient';
import { useLanguage } from '../lib/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { NovaPlayableVideo, NovaVideoPlayer } from '../components/NovaVideoPlayer';
import { resolveVideoSource } from '../../shared/videoSource';

interface WebCitation {
  title: string;
  url: string;
}

type SourceFilter = 'all' | 'web' | 'youtube' | 'pinterest' | 'wikipedia' | 'github' | 'npm' | 'anilist';

const VALID_FILTERS = new Set<SourceFilter>([
  'all',
  'web',
  'youtube',
  'pinterest',
  'wikipedia',
  'github',
  'npm',
  'anilist',
]);

const FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All Sources' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'web', label: 'Web Grounding' },
  { id: 'wikipedia', label: 'Wikipedia' },
  { id: 'github', label: 'GitHub' },
  { id: 'npm', label: 'npm' },
  { id: 'anilist', label: 'AniList' },
];

function toPlayableVideo(item: SourceSearchItem): NovaPlayableVideo {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    thumbnail: item.thumbnail,
    channelName: item.channelName || (item.source === 'YouTube' ? item.meta : undefined),
    duration: item.duration,
    views: item.views,
    publishedAgo: item.publishedAgo,
    description: item.snippet,
    providerHint: item.embedType,
  };
}

function isPlayableSearchItem(item: SourceSearchItem): boolean {
  if (item.embeddable) return true;
  if (item.url.startsWith('/')) return false;
  return resolveVideoSource(item.url, { providerHint: item.embedType }).embeddable;
}

export const SearchPage: React.FC = () => {
  usePageMeta(
    'Search — NOVA',
    'Search across YouTube, Pinterest, Gemini Web Grounding, Wikipedia, GitHub repositories, npm packages, and AniList.',
    '/search'
  );

  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get('q') || '';
  const rawFilter = searchParams.get('source') as SourceFilter | null;
  const initialFilter: SourceFilter = rawFilter && VALID_FILTERS.has(rawFilter) ? rawFilter : 'all';

  const [queryText, setQueryText] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<SourceFilter>(initialFilter);
  const [loading, setLoading] = useState(false);
  const [webAnswer, setWebAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<WebCitation[]>([]);
  const [items, setItems] = useState<SourceSearchItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const [activeVideo, setActiveVideo] = useState<NovaPlayableVideo | null>(null);
  const [autoPlayFromClick, setAutoPlayFromClick] = useState(false);

  const playerSectionRef = useRef<HTMLDivElement | null>(null);
  const didInitialAutoSearchRef = useRef(false);

  const playableVideos = useMemo<NovaPlayableVideo[]>(() => {
    return items.filter(isPlayableSearchItem).map(toPlayableVideo);
  }, [items]);

  const executeSearch = useCallback(
    async (q: string, filter: SourceFilter, syncUrl = true) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setErrorMsg('Enter at least 2 characters to search.');
        return;
      }

      if (syncUrl) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('q', trimmed);
            if (filter === 'all') next.delete('source');
            else next.set('source', filter);
            next.delete('watch');
            return next;
          },
          { replace: false }
        );
      }

      setLoading(true);
      setErrorMsg(null);
      setWarnings([]);
      setHasSearched(true);
      setBrokenThumbs({});
      setActiveVideo(null);

      try {
        const requests: Promise<void>[] = [];

        if (filter === 'all' || filter === 'web') {
          requests.push(
            novaApi.search
              .web(trimmed)
              .then((data) => {
                setWebAnswer(data.answer || null);
                setCitations(Array.isArray(data.citations) ? data.citations : []);
              })
              .catch((e) => {
                setWebAnswer(null);
                setCitations([]);
                setWarnings((prev) => [...prev, `Web Grounding: ${e instanceof Error ? e.message : 'unavailable'}`]);
              })
          );
        } else {
          setWebAnswer(null);
          setCitations([]);
        }

        if (filter !== 'web') {
          const srcParam = filter === 'all' ? 'all' : filter;
          requests.push(
            novaApi.search
              .sources(trimmed, srcParam)
              .then((data) => {
                const loadedItems = Array.isArray(data.results) ? data.results : [];
                setItems(loadedItems);

                const watchParam = searchParams.get('watch');
                if (watchParam) {
                  const matched = loadedItems.find(
                    (it) => isPlayableSearchItem(it) && (it.videoId === watchParam || it.id === watchParam)
                  );
                  if (matched) {
                    setAutoPlayFromClick(false);
                    setActiveVideo(toPlayableVideo(matched));
                  }
                }

                if (Array.isArray(data.errors) && data.errors.length > 0) {
                  setWarnings((prev) => [...prev, ...data.errors]);
                }
              })
              .catch((e) => {
                setItems([]);
                setWarnings((prev) => [...prev, e instanceof Error ? e.message : 'Source search failed']);
              })
          );
        } else {
          setItems([]);
        }

        await Promise.all(requests);
      } finally {
        setLoading(false);
      }
    },
    [searchParams, setSearchParams]
  );

  // Run initial search when arriving with ?q=...
  useEffect(() => {
    if (didInitialAutoSearchRef.current) return;
    didInitialAutoSearchRef.current = true;
    if (initialQuery.trim().length >= 2) {
      void executeSearch(initialQuery, initialFilter, false);
    }
  }, [executeSearch, initialFilter, initialQuery]);

  // Sync activeVideo if user uses browser Back button while ?watch changes
  useEffect(() => {
    const watchParam = searchParams.get('watch');
    if (!watchParam && activeVideo) {
      setActiveVideo(null);
    } else if (watchParam && items.length > 0 && (!activeVideo || (activeVideo.id !== watchParam && !activeVideo.url.includes(watchParam)))) {
      const found = items.find((it) => isPlayableSearchItem(it) && (it.videoId === watchParam || it.id === watchParam));
      if (found) {
        setAutoPlayFromClick(false);
        setActiveVideo(toPlayableVideo(found));
      }
    }
  }, [searchParams, items, activeVideo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(queryText, activeFilter, true);
  };

  const handleFilterClick = (filter: SourceFilter) => {
    setActiveFilter(filter);
    if (queryText.trim().length >= 2) {
      void executeSearch(queryText, filter, true);
    }
  };

  const handleOpenVideo = (item: SourceSearchItem) => {
    const video = toPlayableVideo(item);
    setAutoPlayFromClick(true);
    setActiveVideo(video);
    const watchKey = item.videoId || item.id;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('watch', watchKey);
        return next;
      },
      { replace: false }
    );
    window.requestAnimationFrame(() => {
      playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSelectRelated = (video: NovaPlayableVideo) => {
    setAutoPlayFromClick(true);
    setActiveVideo(video);
    const matched = items.find((it) => it.id === video.id);
    const watchKey = matched?.videoId || video.id;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('watch', watchKey);
        return next;
      },
      { replace: false }
    );
  };

  const handleBackToResults = () => {
    setActiveVideo(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('watch');
        return next;
      },
      { replace: false }
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {t('searchHeading')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('searchSubheading')}
          </p>
        </div>

        <Link
          to="/watch"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Video className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
          <span>{t('watchPlayer')}</span>
        </Link>
      </header>

      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchIcon
              className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search videos, visual pins, anime titles, packages, or general topics..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11151E] ps-10 pe-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Compass className="w-4 h-4" aria-hidden="true" />}
            <span>{loading ? t('searching') : t('searchBtn')}</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#11151E] border border-slate-200 dark:border-slate-800 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleFilterClick(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeFilter === f.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          {warnings.map((w, idx) => (
            <p key={idx}>{w}</p>
          ))}
        </div>
      )}

      {/* Embedded NOVA Video Player (opens in-page without redirecting externally) */}
      {activeVideo && (
        <div ref={playerSectionRef} className="scroll-mt-6">
          <NovaVideoPlayer
            video={activeVideo}
            relatedVideos={playableVideos}
            onSelectRelated={handleSelectRelated}
            onBack={handleBackToResults}
            backLabel="Back to Search Results"
            autoPlayOnUserSelect={autoPlayFromClick}
          />
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && webAnswer && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Web Grounded Summary
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Gemini 4 Hydrogen · Google Search
            </span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200">
            <ReactMarkdown>{webAnswer}</ReactMarkdown>
          </div>
          {citations.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Referenced Sources
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {citations.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-blue-600 dark:text-blue-400 hover:border-blue-500/60 transition-colors"
                  >
                    <span className="truncate">{c.title}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Source Results
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {items.length} matches
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => {
              const isInternal = item.url.startsWith('/');
              const isVideo = isPlayableSearchItem(item);
              const isCurrentlyPlaying = activeVideo?.id === item.id;
              const hasThumb = Boolean(item.thumbnail) && !brokenThumbs[item.id];

              const cardBody = (
                <div
                  className={`h-full rounded-xl border bg-white dark:bg-[#11151E] p-4 transition-colors flex gap-4 text-start ${
                    isCurrentlyPlaying
                      ? 'border-blue-500 ring-1 ring-blue-500/40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-blue-500/60'
                  }`}
                >
                  {item.thumbnail && (
                    <div
                      className={`${
                        isVideo ? 'w-32 aspect-video' : 'w-24 h-24'
                      } rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0 relative flex items-center justify-center group`}
                    >
                      {hasThumb ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" aria-hidden="true" />
                      )}
                      {isVideo && (
                        <>
                          <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <span className="w-8 h-8 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white">
                              <Play className="w-3.5 h-3.5 ms-0.5" fill="currentColor" aria-hidden="true" />
                            </span>
                          </span>
                          {item.duration && (
                            <span className="absolute bottom-1 end-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] tabular-nums text-white">
                              {item.duration}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">
                          {isVideo
                            ? [item.source, item.channelName || item.meta, item.publishedAgo].filter(Boolean).join(' · ')
                            : `${item.source} · ${item.meta}`}
                        </span>
                        {isVideo ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                            <Play className="w-3 h-3" aria-hidden="true" />
                            <span>{isCurrentlyPlaying ? 'Playing' : 'Watch in NOVA'}</span>
                          </span>
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                      </div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {item.snippet}
                      </p>
                    </div>
                  </div>
                </div>
              );

              if (isVideo) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleOpenVideo(item)}
                    className="w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
                  >
                    {cardBody}
                  </button>
                );
              }

              return isInternal ? (
                <Link key={item.id} to={item.url}>
                  {cardBody}
                </Link>
              ) : (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                  {cardBody}
                </a>
              );
            })}
          </div>
        </section>
      )}

      {!loading && !hasSearched && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-10 text-center space-y-3">
          <Compass className="w-8 h-8 text-blue-500 mx-auto" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Search across 7 live providers
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Try searching for &ldquo;Frieren&rdquo;, &ldquo;lofi beats&rdquo;, or &ldquo;TypeScript&rdquo; across YouTube, Pinterest, web grounding, Wikipedia, GitHub, npm, and AniList.
          </p>
        </div>
      )}

      {!loading && hasSearched && !webAnswer && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-900 dark:text-white">No matching results found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Try broadening your query or switching to All Sources.
          </p>
        </div>
      )}
    </div>
  );
};
