import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chatRouter } from './server/routes/chat.ts';
import { imagesRouter } from './server/routes/images.ts';
import { searchRouter } from './server/routes/search.ts';
import { downloaderRouter } from './server/routes/downloader.ts';
import { animeRouter } from './server/routes/anime.ts';
import { supabaseRouter } from './server/routes/supabase.ts';
import { gatewayPublicRouter } from './server/routes/gatewayPublic.ts';
import { adminGatewayRouter } from './server/routes/adminGateway.ts';
import { seoPublicRouter } from './server/routes/seoPublic.ts';
import { adminSeoRouter } from './server/routes/adminSeo.ts';
import {
  generateRobotsTxt,
  generateSitemapIndexXml,
  generateSubSitemapXml,
} from './server/seo/sitemapGenerator.ts';
import { findActiveRedirect, runSeoAuditAndAutomation } from './server/seo/seoEngine.ts';
import { injectSeoIntoHtml } from './server/seo/ssrMeta.ts';
import { NOVA_VIDEO_CSP_HEADER } from './shared/videoSource.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';
const SITE_ORIGIN = (process.env.APP_URL || 'https://nova.vanitasbot.my.id').replace(/\/+$/, '');

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '15mb' }));

  // Baseline security headers (preserve iframe embedding for preview & official video embeds)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nova', timestamp: new Date().toISOString() });
  });

  // Dynamic SEO crawl artifacts (always ahead of static/vite middleware)
  app.get('/robots.txt', (_req, res) => {
    res.status(200).type('text/plain; charset=utf-8').send(generateRobotsTxt());
  });

  app.get('/sitemap.xml', (_req, res) => {
    res.status(200).type('application/xml; charset=utf-8').send(generateSitemapIndexXml());
  });

  app.get('/sitemaps/:kind.xml', (req, res) => {
    const kind = req.params.kind;
    if (kind !== 'core' && kind !== 'tools' && kind !== 'models' && kind !== 'guides' && kind !== 'intl') {
      res.status(404).type('text/plain').send('Sitemap segment not found');
      return;
    }
    res.status(200).type('application/xml; charset=utf-8').send(generateSubSitemapXml(kind));
  });

  // Active SEO redirect middleware for moved/removed pages
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    const rule = findActiveRedirect(req.path);
    if (rule) {
      res.redirect(rule.statusCode, rule.targetPath);
      return;
    }
    next();
  });

  // Core NOVA API modules (routed through API Gateway)
  app.use('/api/chat', chatRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/downloader', downloaderRouter);
  app.use('/api/anime', animeRouter);
  app.use('/api/supabase', supabaseRouter);

  // Centralized Gateway & Admin Routes
  app.use('/api/gateway', gatewayPublicRouter);
  app.use('/api/admin/gateway', adminGatewayRouter);

  // SEO Engine Public & Admin Routes
  app.use('/api/seo', seoPublicRouter);
  app.use('/api/admin/seo', adminSeoRouter);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.get(/.*/, async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const templatePath = path.resolve(__dirname, 'index.html');
        let html = await fs.readFile(templatePath, 'utf-8');
        html = await vite.transformIndexHtml(url, html);
        html = injectSeoIntoHtml(html, url, SITE_ORIGIN);
        res.status(200).set({
          'Content-Type': 'text/html',
          'Content-Security-Policy': NOVA_VIDEO_CSP_HEADER,
        }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get(/.*/, async (req, res) => {
      try {
        const rawHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
        const html = injectSeoIntoHtml(rawHtml, req.originalUrl, SITE_ORIGIN);
        res.status(200).set({ 'Content-Security-Policy': NOVA_VIDEO_CSP_HEADER }).type('html').send(html);
      } catch {
        res.status(500).send('Production bundle not found. Run npm run build first.');
      }
    });
  }

  // Periodic background SEO verification job (every 6 hours)
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    try {
      runSeoAuditAndAutomation();
    } catch {
      // Never crash server loop on background check
    }
  }, sixHoursMs);
  timer.unref();

  app.listen(PORT, HOST, () => {
    console.log(`NOVA server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NOVA server:', err);
  process.exit(1);
});
