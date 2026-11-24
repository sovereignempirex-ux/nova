import { getHreflangAlternates, listSeoPages } from './seoEngine.ts';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getSiteOrigin(): string {
  return (process.env.APP_URL || 'https://nova.vanitasbot.my.id').replace(/\/+$/, '');
}

export function generateRobotsTxt(): string {
  const origin = getSiteOrigin();
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /seo-admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function generateSitemapIndexXml(): string {
  const origin = getSiteOrigin();
  const lastmod = new Date().toISOString().split('T')[0];
  const subSitemaps = ['core', 'tools', 'models', 'guides', 'intl'];

  const items = subSitemaps
    .map(
      (name) => `  <sitemap>
    <loc>${escapeXml(`${origin}/sitemaps/${name}.xml`)}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>
`;
}

export function generateSubSitemapXml(kind: 'core' | 'tools' | 'models' | 'guides' | 'intl'): string {
  const publishedIndexable = listSeoPages({ status: 'published' }).filter(
    (p) => !p.robots.includes('noindex')
  );

  const filtered = publishedIndexable.filter((p) => {
    if (kind === 'core') return p.pageType === 'core' || p.pageType === 'category';
    if (kind === 'tools') return p.pageType === 'tool';
    if (kind === 'models') return p.pageType === 'model';
    if (kind === 'guides') return p.pageType === 'guide' || p.pageType === 'doc' || p.pageType === 'anime';
    if (kind === 'intl') return p.pageType === 'programmatic_tool';
    return false;
  });

  const entries = filtered
    .map((page) => {
      const alternates = getHreflangAlternates(page);
      const xhtmlLinks = alternates
        .map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`
        )
        .join('\n');

      const priority =
        page.path === '/' ? '1.0' : page.pageType === 'tool' || page.pageType === 'programmatic_tool' ? '0.9' : '0.8';
      const changefreq = page.pageType === 'anime' ? 'daily' : 'weekly';
      const lastmod = (page.updatedAt || new Date().toISOString()).split('T')[0];

      return `  <url>
    <loc>${escapeXml(page.canonicalUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${xhtmlLinks ? `\n${xhtmlLinks}` : ''}
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}
