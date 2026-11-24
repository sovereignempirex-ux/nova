import { Router } from 'express';
import { getLanguageMeta, SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import { computeLanguageCoverage } from '../seo/seoAudit.ts';
import { getHreflangAlternates, getSeoPageByPath, listSeoPages } from '../seo/seoEngine.ts';

export const seoPublicRouter = Router();

seoPublicRouter.get('/languages', (_req, res) => {
  const all = listSeoPages({ status: 'published' });
  const coverage = computeLanguageCoverage(all);
  res.json({
    totalLanguages: SUPPORTED_LANGUAGES.length,
    languages: coverage,
  });
});

seoPublicRouter.get('/catalog', (_req, res) => {
  const published = listSeoPages({ status: 'published' }).filter((p) => !p.robots.includes('noindex'));
  res.json({
    pages: published.map((p) => ({
      id: p.id,
      slug: p.slug,
      path: p.path,
      pageType: p.pageType,
      lang: p.lang,
      title: p.title,
      description: p.description,
      h1: p.h1,
      updatedAt: p.updatedAt,
    })),
  });
});

seoPublicRouter.get('/page', (req, res) => {
  const targetPath = typeof req.query.path === 'string' ? req.query.path : '/';
  const page = getSeoPageByPath(targetPath);

  if (!page || page.status !== 'published') {
    res.status(404).json({ error: 'Published SEO page not found.' });
    return;
  }

  res.json({
    page: {
      id: page.id,
      slug: page.slug,
      path: page.path,
      pageType: page.pageType,
      lang: page.lang,
      langMeta: getLanguageMeta(page.lang),
      title: page.title,
      description: page.description,
      h1: page.h1,
      canonicalUrl: page.canonicalUrl,
      robots: page.robots,
      contentMarkdown: page.contentMarkdown,
      faqs: page.faqs || [],
      internalLinks: page.internalLinks,
      structuredData: page.structuredData,
      alternates: getHreflangAlternates(page),
      updatedAt: page.updatedAt,
    },
  });
});
