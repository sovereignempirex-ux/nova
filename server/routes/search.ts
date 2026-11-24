import { Router } from 'express';
import { formatGeminiError, getGeminiClient } from '../gemini.ts';
import { hashIp } from '../middleware/adminAuth.ts';
import { nezukoAdapter } from '../gateway/adapters/nezukoAdapter.ts';
import { executeGatewayCall } from '../gateway/gateway.ts';
import { extractYouTubeVideoId } from '../../shared/videoSource.ts';

export const searchRouter = Router();

interface SearchResultItem {
  id: string;
  source: string;
  title: string;
  snippet: string;
  url: string;
  meta: string;
  thumbnail?: string;
  videoId?: string;
  channelName?: string;
  duration?: string;
  views?: number;
  publishedAgo?: string;
  embedType?: 'youtube';
  embeddable?: boolean;
}

searchRouter.post('/web', async (req, res) => {
  const { query } = req.body as { query?: string };
  if (typeof query !== 'string' || query.trim().length < 2) {
    res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    return;
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Provide a clear, factual summary answering this search query with concise key points: ${query.trim().slice(0, 500)}`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const citations: { title: string; url: string }[] = [];
    const seen = new Set<string>();

    for (const chunk of rawChunks) {
      const uri = chunk.web?.uri;
      const title = chunk.web?.title;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        citations.push({
          title: title || uri,
          url: uri,
        });
      }
    }

    res.json({
      answer: response.text ?? '',
      citations,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
  }
});

searchRouter.get('/sources', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const source = typeof req.query.source === 'string' ? req.query.source : 'all';

  if (q.length < 2) {
    res.status(400).json({ error: 'Query parameter q must be at least 2 characters.' });
    return;
  }

  const ipHash = hashIp(req.ip);
  const results: SearchResultItem[] = [];
  const errors: string[] = [];
  const tasks: Promise<void>[] = [];

  if (source === 'all' || source === 'youtube') {
    tasks.push(
      (async () => {
        const gw = await executeGatewayCall({
          providerSlug: 'nezuko',
          modelId: 'nezuko:yt-search',
          capability: 'search',
          type: 'search',
          endpoint: `/api/search/yt-search?q=${encodeURIComponent(q)}`,
          method: 'GET',
          rateLimitKey: `search:${ipHash}`,
          ipHash,
          execute: async () => (await nezukoAdapter.youtubeSearch(q)).data!,
        });
        if (!gw.success || !gw.data) {
          errors.push(`YouTube (Nezuko): ${gw.error?.message || 'unavailable'}`);
          return;
        }
        const videos = gw.data.results ?? (gw.data.main_result ? [gw.data.main_result] : []);
        for (const [idx, v] of videos.slice(0, 8).entries()) {
          const videoId = extractYouTubeVideoId(v.url);
          results.push({
            id: videoId ? `yt-${videoId}` : `yt-${idx}-${v.url}`,
            source: 'YouTube',
            title: v.title,
            snippet: [v.author?.name, v.published_ago, v.views ? `${v.views.toLocaleString()} views` : null]
              .filter(Boolean)
              .join(' · '),
            url: v.url,
            meta: v.duration || 'Video',
            thumbnail: v.thumbnail ? `/api/images/proxy?url=${encodeURIComponent(v.thumbnail)}` : undefined,
            videoId: videoId || undefined,
            channelName: v.author?.name || undefined,
            duration: v.duration || undefined,
            views: typeof v.views === 'number' ? v.views : undefined,
            publishedAgo: v.published_ago || undefined,
            embedType: videoId ? 'youtube' : undefined,
            embeddable: Boolean(videoId),
          });
        }
      })()
    );
  }

  if (source === 'all' || source === 'pinterest') {
    tasks.push(
      (async () => {
        const gw = await executeGatewayCall({
          providerSlug: 'nezuko',
          modelId: 'nezuko:pinterest-search',
          capability: 'search',
          type: 'search',
          endpoint: `/api/search/pinterest-search?q=${encodeURIComponent(q)}`,
          method: 'GET',
          rateLimitKey: `search:${ipHash}`,
          ipHash,
          execute: async () => (await nezukoAdapter.pinterestSearch(q)).data!,
        });
        if (!gw.success || !gw.data) {
          errors.push(`Pinterest (Nezuko): ${gw.error?.message || 'unavailable'}`);
          return;
        }
        for (const p of (gw.data.results ?? []).slice(0, 6)) {
          const pinUrl = p.image_url || p.publisher?.profile_url || 'https://www.pinterest.com';
          results.push({
            id: `pin-${p.pin_id}`,
            source: 'Pinterest',
            title: p.title?.trim() || 'Pinterest Pin',
            snippet: [
              p.publisher?.name ? `By ${p.publisher.name}` : null,
              typeof p.stats?.repin_count === 'number' ? `${p.stats.repin_count} repins` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Visual pin from Pinterest search.',
            url: pinUrl,
            meta: p.publisher?.username ? `@${p.publisher.username}` : 'Image Pin',
            thumbnail: p.image_url ? `/api/images/proxy?url=${encodeURIComponent(p.image_url)}` : undefined,
          });
        }
      })()
    );
  }

  if (source === 'all' || source === 'wikipedia') {
    tasks.push(
      (async () => {
        try {
          const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=6&utf8=1`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'NOVA-Vanitas/1.0' } });
          if (!resp.ok) throw new Error(`Wikipedia HTTP ${resp.status}`);
          const data = (await resp.json()) as {
            query?: { search?: Array<{ pageid: number; title: string; snippet: string; wordcount: number }> };
          };
          for (const item of data.query?.search ?? []) {
            const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '');
            results.push({
              id: `wiki-${item.pageid}`,
              source: 'Wikipedia',
              title: item.title,
              snippet: cleanSnippet,
              url: `https://en.wikipedia.org/?curid=${item.pageid}`,
              meta: `${item.wordcount.toLocaleString()} words`,
            });
          }
        } catch (e) {
          errors.push(`Wikipedia: ${e instanceof Error ? e.message : 'unavailable'}`);
        }
      })()
    );
  }

  if (source === 'all' || source === 'github') {
    tasks.push(
      (async () => {
        try {
          const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=6`;
          const resp = await fetch(url, {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'NOVA-Vanitas/1.0',
            },
          });
          if (!resp.ok) throw new Error(`GitHub HTTP ${resp.status}`);
          const data = (await resp.json()) as {
            items?: Array<{
              id: number;
              full_name: string;
              description: string | null;
              html_url: string;
              stargazers_count: number;
              language: string | null;
            }>;
          };
          for (const repo of data.items ?? []) {
            results.push({
              id: `gh-${repo.id}`,
              source: 'GitHub',
              title: repo.full_name,
              snippet: repo.description || 'No repository description provided.',
              url: repo.html_url,
              meta: `${repo.language || 'Code'} · ${repo.stargazers_count.toLocaleString()} stars`,
            });
          }
        } catch (e) {
          errors.push(`GitHub: ${e instanceof Error ? e.message : 'unavailable'}`);
        }
      })()
    );
  }

  if (source === 'all' || source === 'npm') {
    tasks.push(
      (async () => {
        try {
          const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=6`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'NOVA-Vanitas/1.0' } });
          if (!resp.ok) throw new Error(`npm HTTP ${resp.status}`);
          const data = (await resp.json()) as {
            objects?: Array<{
              package: {
                name: string;
                version: string;
                description?: string;
                links?: { npm?: string };
              };
            }>;
          };
          for (const entry of data.objects ?? []) {
            const pkg = entry.package;
            results.push({
              id: `npm-${pkg.name}`,
              source: 'npm',
              title: pkg.name,
              snippet: pkg.description || 'JavaScript package on npm registry.',
              url: pkg.links?.npm || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`,
              meta: `v${pkg.version}`,
            });
          }
        } catch (e) {
          errors.push(`npm: ${e instanceof Error ? e.message : 'unavailable'}`);
        }
      })()
    );
  }

  if (source === 'all' || source === 'anilist') {
    tasks.push(
      (async () => {
        try {
          const query = `
            query ($search: String) {
              Page(page: 1, perPage: 6) {
                media(search: $search, type: ANIME, isAdult: false) {
                  id
                  title { romaji english }
                  format
                  seasonYear
                  averageScore
                  description(asHtml: false)
                  siteUrl
                }
              }
            }
          `;
          const resp = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query, variables: { search: q } }),
          });
          if (!resp.ok) throw new Error(`AniList HTTP ${resp.status}`);
          const json = (await resp.json()) as {
            data?: {
              Page?: {
                media?: Array<{
                  id: number;
                  title: { romaji: string; english: string | null };
                  format: string | null;
                  seasonYear: number | null;
                  averageScore: number | null;
                  description: string | null;
                  siteUrl: string;
                }>;
              };
            };
          };
          for (const m of json.data?.Page?.media ?? []) {
            const cleanDesc = (m.description || '').replace(/<[^>]+>/g, '').slice(0, 220);
            results.push({
              id: `anilist-${m.id}`,
              source: 'AniList',
              title: m.title.english || m.title.romaji,
              snippet: cleanDesc || 'Anime title indexed on AniList.',
              url: `/anime/${m.id}`,
              meta: [m.format, m.seasonYear, m.averageScore ? `Score ${m.averageScore}%` : null].filter(Boolean).join(' · '),
            });
          }
        } catch (e) {
          errors.push(`AniList: ${e instanceof Error ? e.message : 'unavailable'}`);
        }
      })()
    );
  }

  await Promise.all(tasks);
  res.json({ results, errors });
});
