import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Film,
  Play,
} from 'lucide-react';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { usePageMeta } from '../hooks/usePageMeta';
import { NovaVideoPlayer } from '../components/NovaVideoPlayer';

interface AnimeDetail {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null };
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  source: string | null;
  genres: string[];
  description: string | null;
  siteUrl: string;
  trailer: { id: string; site: string } | null;
  studios: { nodes: Array<{ id: number; name: string }> };
  characters: {
    edges: Array<{
      role: string;
      node: { id: number; name: { full: string }; image: { medium: string | null } };
      voiceActors: Array<{ id: number; name: { full: string } }>;
    }>;
  };
  relations: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: { romaji: string; english: string | null };
        format: string | null;
        type: string;
        coverImage: { medium: string | null };
      };
    }>;
  };
  recommendations: {
    nodes: Array<{
      mediaRecommendation: {
        id: number;
        title: { romaji: string; english: string | null };
        format: string | null;
        averageScore: number | null;
        episodes: number | null;
        coverImage: { large: string | null };
      } | null;
    }>;
  };
}

export const AnimeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  const displayTitle = anime ? anime.title.english || anime.title.romaji : 'Anime Details';
  usePageMeta(
    `${displayTitle} — NOVA Anime Hub`,
    anime?.description?.replace(/<[^>]+>/g, '').slice(0, 155) || 'Explore anime cast, studios, synopsis, and recommendations on NOVA.',
    `/anime/${id ?? ''}`
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    setCoverFailed(false);
    setShowTrailer(false);

    fetch(`/api/anime/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load anime details.');
        return data as { anime: AnimeDetail };
      })
      .then((data) => setAnime(data.anime))
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Unable to load anime.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user || !id) {
      setIsBookmarked(false);
      return;
    }
    const path = `users/${user.uid}/animeBookmarks/${id}`;
    getDoc(doc(db, 'users', user.uid, 'animeBookmarks', id))
      .then((snap) => setIsBookmarked(snap.exists()))
      .catch((err) => handleFirestoreError(err, OperationType.GET, path));
  }, [user, id]);

  const toggleBookmark = async () => {
    if (!user || !user.emailVerified || !anime) return;
    const idStr = String(anime.id);
    const path = `users/${user.uid}/animeBookmarks/${idStr}`;
    const ref = doc(db, 'users', user.uid, 'animeBookmarks', idStr);
    try {
      if (isBookmarked) {
        await deleteDoc(ref);
        setIsBookmarked(false);
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
        setIsBookmarked(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="h-56 rounded-xl bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
      </div>
    );
  }

  if (errorMsg || !anime) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-12 space-y-4">
        <Link
          to="/anime"
          className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Anime Hub</span>
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 flex items-center gap-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{errorMsg || 'Anime entry not found.'}</span>
        </div>
      </div>
    );
  }

  const coverUrl = anime.coverImage.extraLarge || anime.coverImage.large;
  const cleanSynopsis = (anime.description || 'No synopsis available.').replace(/<[^>]+>/g, '');
  const studios = anime.studios.nodes.map((s) => s.name).join(', ') || 'Unknown Studio';

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-10">
      <Link
        to="/anime"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Back to Anime Hub</span>
      </Link>

      {/* Header Split */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-4 lg:col-span-3">
          <div className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
            {!coverUrl || coverFailed ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                <Film className="w-8 h-8 text-slate-500 mb-2" aria-hidden="true" />
                <span className="text-xs text-slate-300">{displayTitle}</span>
              </div>
            ) : (
              <img
                src={coverUrl}
                alt={displayTitle}
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="w-full h-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="md:col-span-8 lg:col-span-9 space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {[
                anime.format,
                anime.status,
                anime.season && anime.seasonYear ? `${anime.season} ${anime.seasonYear}` : anime.seasonYear,
                anime.episodes ? `${anime.episodes} episodes` : null,
                anime.duration ? `${anime.duration} min` : null,
                anime.averageScore ? `Score ${anime.averageScore}%` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
              {displayTitle}
            </h1>
            {anime.title.native && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{anime.title.native}</p>
            )}
          </div>

          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {cleanSynopsis}
          </p>

          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Studio: </span>
              {studios}
            </p>
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Genres: </span>
              {anime.genres.join(' · ') || 'N/A'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {user && (
              <button
                type="button"
                onClick={() => void toggleBookmark()}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isBookmarked
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
                <span>{isBookmarked ? 'Bookmarked' : 'Save Bookmark'}</span>
              </button>
            )}

            <a
              href={anime.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>View on AniList</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>

            {anime.trailer && (anime.trailer.site === 'youtube' || anime.trailer.site === 'dailymotion') && (
              <button
                type="button"
                onClick={() => setShowTrailer((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  showTrailer
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showTrailer ? 'Close Trailer Player' : 'Watch Trailer'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {showTrailer &&
        anime.trailer &&
        (anime.trailer.site === 'youtube' || anime.trailer.site === 'dailymotion') && (
          <NovaVideoPlayer
            video={{
              id: `anime-trailer-${anime.id}`,
              title: `${displayTitle} — Official Trailer`,
              url: anime.trailer.id,
              providerHint: anime.trailer.site,
              channelName: studios,
              thumbnail: anime.bannerImage || coverUrl || undefined,
              description: cleanSynopsis.slice(0, 260),
            }}
            onBack={() => setShowTrailer(false)}
            backLabel="Close Trailer"
            autoPlayOnUserSelect={true}
            compact={true}
          />
        )}

      {/* Characters & Voice Cast */}
      {anime.characters.edges.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Characters &amp; Voice Cast
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {anime.characters.edges.map((edge) => {
              const va = edge.voiceActors[0];
              return (
                <div
                  key={edge.node.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-3"
                >
                  <div className="w-12 h-14 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                    {edge.node.image.medium && (
                      <img
                        src={edge.node.image.medium}
                        alt={edge.node.name.full}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {edge.node.name.full}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {edge.role}
                      {va ? ` · VA: ${va.name.full}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {anime.recommendations.nodes.some((n) => n.mediaRecommendation) && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Related Recommendations
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {anime.recommendations.nodes.map((n) => {
              const rec = n.mediaRecommendation;
              if (!rec) return null;
              const recTitle = rec.title.english || rec.title.romaji;
              return (
                <Link key={rec.id} to={`/anime/${rec.id}`} className="group space-y-2">
                  <div className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
                    {rec.coverImage.large && (
                      <img
                        src={rec.coverImage.large}
                        alt={recTitle}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                      />
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-500">
                    {recTitle}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
