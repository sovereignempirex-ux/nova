import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bookmark, Film, Search } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { usePageMeta } from '../hooks/usePageMeta';

interface AnimeItem {
  id: number;
  title: { romaji: string; english: string | null };
  coverImage: { large: string | null; extraLarge: string | null; color: string | null };
  format: string | null;
  status: string | null;
  episodes: number | null;
  seasonYear: number | null;
  averageScore: number | null;
  genres: string[];
  studios?: { nodes: Array<{ id: number; name: string }> };
}

const GENRES = ['ALL', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Mystery', 'Sci-Fi', 'Slice of Life'];
const FORMATS = ['ALL', 'TV', 'MOVIE', 'OVA', 'ONA'];
const SORTS = [
  { id: 'TRENDING_DESC', label: 'Trending' },
  { id: 'POPULARITY_DESC', label: 'Popular' },
  { id: 'SCORE_DESC', label: 'Top Rated' },
];

export const AnimeHubPage: React.FC = () => {
  usePageMeta(
    'Anime Hub — NOVA',
    'Explore trending, popular, and top-rated anime from AniList with genre filters, studios, and personal bookmarks.',
    '/anime'
  );

  const { user, authReady } = useAuth();
  const { t } = useLanguage();
  const [sort, setSort] = useState('TRENDING_DESC');
  const [genre, setGenre] = useState('ALL');
  const [format, setFormat] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AnimeItem[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!authReady || !user) {
      setBookmarkedIds(new Set());
      return;
    }
    const path = `users/${user.uid}/animeBookmarks`;
    const q = query(
      collection(db, 'users', user.uid, 'animeBookmarks'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = new Set<number>();
        snap.docs.forEach((d) => {
          const val = Number(d.data().animeId);
          if (val) next.add(val);
        });
        setBookmarkedIds(next);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams({
      sort,
      genre,
      format,
      page: String(page),
    });
    if (activeQuery) params.set('q', activeQuery);

    fetch(`/api/anime/discover?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load anime catalog.');
        return data as { media?: AnimeItem[]; pageInfo?: { hasNextPage: boolean } };
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.media ?? []);
        setHasNextPage(Boolean(data.pageInfo?.hasNextPage));
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to reach AniList.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sort, genre, format, activeQuery, page]);

  const toggleBookmark = async (e: React.MouseEvent, anime: AnimeItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !user.emailVerified) return;

    const idStr = String(anime.id);
    const path = `users/${user.uid}/animeBookmarks/${idStr}`;
    const ref = doc(db, 'users', user.uid, 'animeBookmarks', idStr);
    try {
      if (bookmarkedIds.has(anime.id)) {
        await deleteDoc(ref);
      } else {
        const payload: Record<string, unknown> = {
          userId: user.uid,
          animeId: anime.id,
          title: (anime.title.english || anime.title.romaji).slice(0, 255),
          format: (anime.format || 'TV').slice(0, 32),
          createdAt: serverTimestamp(),
        };
        if (anime.coverImage.large) payload.coverImage = anime.coverImage.large.slice(0, 500);
        if (typeof anime.episodes === 'number') payload.episodes = anime.episodes;
        if (typeof anime.averageScore === 'number') payload.score = anime.averageScore;
        await setDoc(ref, payload);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <header className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          {t('animeHeading')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('animeSubheading')}
        </p>
      </header>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#11151E] border border-slate-200 dark:border-slate-800">
            {SORTS.map((s) => {
              const label =
                s.id === 'TRENDING_DESC'
                  ? t('sortTrending')
                  : s.id === 'POPULARITY_DESC'
                  ? t('sortPopular')
                  : t('sortTopRated');
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSort(s.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    sort === s.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <select
            aria-label="Filter by genre"
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11151E] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g === 'ALL' ? 'All Genres' : g}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by format"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11151E] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f === 'ALL' ? 'All Formats' : f}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:w-80">
          <div className="relative flex-1">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search anime titles..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11151E] ps-9 pe-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {t('searchBtn')}
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <div className="aspect-[3/4] rounded-xl bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-12 text-center space-y-2">
          <Film className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900 dark:text-white">No anime matched those filters</p>
          <button
            type="button"
            onClick={() => {
              setGenre('ALL');
              setFormat('ALL');
              setSearchInput('');
              setActiveQuery('');
              setPage(1);
            }}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            {items.map((anime) => {
              const title = anime.title.english || anime.title.romaji;
              const imgUrl = anime.coverImage.extraLarge || anime.coverImage.large;
              const isBookmarked = bookmarkedIds.has(anime.id);
              const showFallback = !imgUrl || failedImages.has(anime.id);

              return (
                <Link
                  key={anime.id}
                  to={`/anime/${anime.id}`}
                  className="group flex flex-col space-y-2.5"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
                    {showFallback ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-800 to-slate-950">
                        <Film className="w-7 h-7 text-slate-500 mb-2" aria-hidden="true" />
                        <span className="text-xs text-slate-300 line-clamp-2">{title}</span>
                      </div>
                    ) : (
                      <img
                        src={imgUrl}
                        alt={title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() =>
                          setFailedImages((prev) => new Set(prev).add(anime.id))
                        }
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    )}

                    {user && (
                      <button
                        type="button"
                        onClick={(e) => void toggleBookmark(e, anime)}
                        aria-label={isBookmarked ? `Remove ${title} bookmark` : `Bookmark ${title}`}
                        className={`absolute top-2.5 end-2.5 p-2 rounded-lg backdrop-blur-sm transition-colors ${
                          isBookmarked
                            ? 'bg-blue-600 text-white'
                            : 'bg-black/60 text-slate-200 hover:bg-black/80'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                      {title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                      {[
                        anime.format,
                        anime.seasonYear,
                        anime.averageScore ? `${anime.averageScore}%` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t('previousPage')}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {page}
            </span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t('nextPage')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
