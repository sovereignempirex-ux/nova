import { Router } from 'express';

export const animeRouter = Router();

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

async function queryAniList<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const resp = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'NOVA-Vanitas/1.0',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) {
    throw new Error(`AniList API returned HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error('Empty response from AniList');
  }
  return json.data;
}

animeRouter.get('/discover', async (req, res) => {
  const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'TRENDING_DESC';
  const search = typeof req.query.q === 'string' && req.query.q.trim().length > 0 ? req.query.q.trim() : undefined;
  const genre = typeof req.query.genre === 'string' && req.query.genre !== 'ALL' ? req.query.genre : undefined;
  const format = typeof req.query.format === 'string' && req.query.format !== 'ALL' ? req.query.format : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);

  const allowedSorts = new Set(['TRENDING_DESC', 'POPULARITY_DESC', 'SCORE_DESC', 'FAVOURITES_DESC']);
  const sort = allowedSorts.has(sortParam) ? sortParam : 'TRENDING_DESC';

  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String, $genre: String, $format: MediaFormat) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
        }
        media(type: ANIME, isAdult: false, sort: $sort, search: $search, genre: $genre, format: $format) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            extraLarge
            color
          }
          bannerImage
          format
          status
          episodes
          duration
          season
          seasonYear
          averageScore
          popularity
          genres
          studios(isMain: true) {
            nodes {
              id
              name
            }
          }
          description(asHtml: false)
        }
      }
    }
  `;

  try {
    const data = await queryAniList<{ Page: unknown }>(query, {
      page,
      perPage: 18,
      sort: [search ? 'SEARCH_MATCH' : sort],
      search,
      genre,
      format,
    });
    res.json(data.Page);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to fetch anime catalog from AniList.',
    });
  }
});

animeRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid anime ID.' });
    return;
  }

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME, isAdult: false) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
          color
        }
        bannerImage
        format
        status
        episodes
        duration
        season
        seasonYear
        startDate { year month day }
        endDate { year month day }
        averageScore
        meanScore
        popularity
        favourites
        source
        genres
        description(asHtml: false)
        siteUrl
        trailer {
          id
          site
        }
        studios(isMain: true) {
          nodes {
            id
            name
          }
        }
        characters(sort: [ROLE, RELEVANCE], perPage: 10) {
          edges {
            role
            node {
              id
              name { full }
              image { medium }
            }
            voiceActors(language: JAPANESE, sort: RELEVANCE) {
              id
              name { full }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english }
              format
              type
              coverImage { medium }
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 6) {
          nodes {
            mediaRecommendation {
              id
              title { romaji english }
              format
              averageScore
              episodes
              coverImage { large }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await queryAniList<{ Media: unknown }>(query, { id });
    if (!data.Media) {
      res.status(404).json({ error: 'Anime not found.' });
      return;
    }
    res.json({ anime: data.Media });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to fetch anime details.',
    });
  }
});
