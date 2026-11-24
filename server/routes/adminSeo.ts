import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.ts';
import {
  addSeoRedirect,
  deleteSeoPage,
  deleteSeoRedirect,
  getSeoAutomationLogs,
  listSeoRedirects,
  publishOrUpdateSeoPage,
  runSeoAuditAndAutomation,
} from '../seo/seoEngine.ts';
import {
  getGscConfigStatus,
  inspectUrlInGsc,
  querySearchAnalytics,
  submitSitemapToGsc,
} from '../seo/searchConsoleService.ts';
import { generateSeoDraftWithAi } from '../seo/seoAssistant.ts';
import type { SeoIndexingStatus, SeoPageType, SeoPublicationStatus } from '../seo/types.ts';

export const adminSeoRouter = Router();

adminSeoRouter.use(requireAdmin);

adminSeoRouter.get('/audit', (_req, res) => {
  const report = runSeoAuditAndAutomation();
  res.json({
    ...report,
    gsc: getGscConfigStatus(),
  });
});

adminSeoRouter.post('/pages', (req, res) => {
  const body = req.body as {
    id?: string;
    slug?: string;
    path?: string;
    pageType?: SeoPageType;
    lang?: string;
    hreflangGroup?: string;
    title?: string;
    description?: string;
    h1?: string;
    robots?: string;
    status?: SeoPublicationStatus;
    indexingStatus?: SeoIndexingStatus;
    contentMarkdown?: string;
    faqs?: Array<{ question: string; answer: string }>;
  };

  if (!body.path || !body.title || !body.description || !body.contentMarkdown) {
    res.status(400).json({ error: 'path, title, description, and contentMarkdown are required.' });
    return;
  }

  try {
    const page = publishOrUpdateSeoPage({
      id: body.id,
      slug: body.slug || body.path.replace(/^\/+/, '').replace(/\//g, '-') || 'page',
      path: body.path,
      pageType: body.pageType || 'programmatic_tool',
      lang: body.lang || 'en',
      hreflangGroup: body.hreflangGroup,
      title: body.title,
      description: body.description,
      h1: body.h1 || body.title,
      robots: body.robots,
      status: body.status || 'published',
      indexingStatus: body.indexingStatus,
      contentMarkdown: body.contentMarkdown,
      faqs: body.faqs,
    });
    res.status(201).json({ page });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to publish SEO page.' });
  }
});

adminSeoRouter.delete('/pages/:id', (req, res) => {
  const redirectTo = typeof req.query.redirectTo === 'string' ? req.query.redirectTo : undefined;
  const deleted = deleteSeoPage(req.params.id, redirectTo);
  if (!deleted) {
    res.status(404).json({ error: 'SEO page not found.' });
    return;
  }
  res.json({ deleted: true, redirectCreated: Boolean(redirectTo) });
});

adminSeoRouter.get('/redirects', (_req, res) => {
  res.json({ redirects: listSeoRedirects() });
});

adminSeoRouter.post('/redirects', (req, res) => {
  const body = req.body as { sourcePath?: string; targetPath?: string; statusCode?: 301 | 302 | 307 | 308 };
  if (!body.sourcePath || !body.targetPath) {
    res.status(400).json({ error: 'sourcePath and targetPath are required.' });
    return;
  }
  const rule = addSeoRedirect(body.sourcePath, body.targetPath, body.statusCode || 301);
  res.status(201).json({ redirect: rule });
});

adminSeoRouter.delete('/redirects/:id', (req, res) => {
  const deleted = deleteSeoRedirect(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Redirect rule not found.' });
    return;
  }
  res.json({ deleted: true });
});

adminSeoRouter.post('/assistant/generate', async (req, res) => {
  const body = req.body as {
    topicOrPath?: string;
    targetLang?: string;
    sourceTitle?: string;
    sourceDescription?: string;
    sourceBody?: string;
  };

  if (!body.topicOrPath || !body.targetLang) {
    res.status(400).json({ error: 'topicOrPath and targetLang are required.' });
    return;
  }

  try {
    const draft = await generateSeoDraftWithAi({
      topicOrPath: body.topicOrPath,
      targetLang: body.targetLang,
      sourceTitle: body.sourceTitle,
      sourceDescription: body.sourceDescription,
      sourceBody: body.sourceBody,
    });
    res.json({ draft });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'AI assistant failed.' });
  }
});

adminSeoRouter.get('/automation/logs', (_req, res) => {
  res.json({ logs: getSeoAutomationLogs() });
});

adminSeoRouter.post('/automation/run', (_req, res) => {
  const result = runSeoAuditAndAutomation();
  res.json({
    ok: true,
    summary: result.summary,
    logs: result.automationLogs,
  });
});

adminSeoRouter.get('/gsc/status', (_req, res) => {
  res.json(getGscConfigStatus());
});

adminSeoRouter.post('/gsc/analytics', async (req, res) => {
  const body = req.body as {
    startDate?: string;
    endDate?: string;
    dimensions?: Array<'query' | 'page' | 'country' | 'device'>;
    rowLimit?: number;
  };
  const oauthAccessToken = typeof req.headers['x-gsc-access-token'] === 'string'
    ? req.headers['x-gsc-access-token']
    : undefined;

  const end = body.endDate || new Date().toISOString().split('T')[0];
  const start =
    body.startDate || new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const data = await querySearchAnalytics({
      startDate: start,
      endDate: end,
      dimensions: body.dimensions || ['query'],
      rowLimit: body.rowLimit || 50,
      oauthAccessToken,
    });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to fetch Search Console data.' });
  }
});

adminSeoRouter.post('/gsc/submit-sitemap', async (req, res) => {
  const body = req.body as { sitemapUrl?: string };
  const oauthAccessToken = typeof req.headers['x-gsc-access-token'] === 'string'
    ? req.headers['x-gsc-access-token']
    : undefined;

  try {
    const result = await submitSitemapToGsc(body.sitemapUrl, oauthAccessToken);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Sitemap submission failed.' });
  }
});

adminSeoRouter.post('/gsc/inspect-url', async (req, res) => {
  const body = req.body as { inspectionUrl?: string };
  const oauthAccessToken = typeof req.headers['x-gsc-access-token'] === 'string'
    ? req.headers['x-gsc-access-token']
    : undefined;

  if (!body.inspectionUrl) {
    res.status(400).json({ error: 'inspectionUrl is required.' });
    return;
  }

  try {
    const result = await inspectUrlInGsc(body.inspectionUrl, oauthAccessToken);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'URL inspection failed.' });
  }
});
