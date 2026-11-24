import { getLanguageMeta } from '../../shared/languages.ts';
import { getHreflangAlternates, getSeoPageByPath } from './seoEngine.ts';
import { buildStructuredDataForPage } from './seoAudit.ts';

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeJsonLd(data: unknown): string {
  // Prevent closing script tag injection
  return JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
}

export function injectSeoIntoHtml(html: string, requestPath: string, siteOrigin: string): string {
  const cleanPath = requestPath.split('?')[0].replace(/\/+$/, '') || '/';
  const cleanOrigin = siteOrigin.replace(/\/+$/, '');

  // Admin & internal control consoles must always be noindex
  if (cleanPath === '/admin' || cleanPath === '/seo-admin') {
    const adminMeta = `<meta name="robots" content="noindex,nofollow" />`;
    return html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>NOVA Admin Console</title>`)
      .replace('</head>', `  ${adminMeta}\n  </head>`);
  }

  const page = getSeoPageByPath(cleanPath);

  if (!page) {
    // Handle dynamic /anime/:id cleanly with canonical & basic metadata
    if (cleanPath.startsWith('/anime/')) {
      const animeId = cleanPath.replace('/anime/', '');
      const canonical = `${cleanOrigin}${cleanPath}`;
      const title = `Anime Details #${animeId} | NOVA Anime Hub`;
      const desc = `Explore live AniList synopsis, episodes, score, studio, and trailer metadata for Anime #${animeId} on NOVA.`;
      const sd = buildStructuredDataForPage(
        {
          pageType: 'anime',
          title,
          description: desc,
          canonicalUrl: canonical,
          path: cleanPath,
          lang: 'en',
        },
        cleanOrigin
      );

      let out = html
        .replace(/<html[^>]*>/i, '<html lang="en" dir="ltr" class="dark">')
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(title)}</title>`)
        .replace(
          /<meta\s+name="description"[^>]*>/i,
          `<meta name="description" content="${escapeHtmlAttr(desc)}" />`
        )
        .replace(
          /<link\s+rel="canonical"[^>]*>/i,
          `<link rel="canonical" href="${escapeHtmlAttr(canonical)}" />`
        )
        .replace(
          /<meta\s+property="og:url"[^>]*>/i,
          `<meta property="og:url" content="${escapeHtmlAttr(canonical)}" />`
        )
        .replace(
          /<meta\s+property="og:title"[^>]*>/i,
          `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`
        )
        .replace(
          /<meta\s+property="og:description"[^>]*>/i,
          `<meta property="og:description" content="${escapeHtmlAttr(desc)}" />`
        )
        .replace(
          /<meta\s+name="twitter:title"[^>]*>/i,
          `<meta name="twitter:title" content="${escapeHtmlAttr(title)}" />`
        )
        .replace(
          /<meta\s+name="twitter:description"[^>]*>/i,
          `<meta name="twitter:description" content="${escapeHtmlAttr(desc)}" />`
        )
        .replace(
          /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
          `<script type="application/ld+json">\n${safeJsonLd(sd)}\n    </script>`
        );
      return out;
    }
    return html;
  }

  const langMeta = getLanguageMeta(page.lang);
  const alternates = getHreflangAlternates(page);
  const hreflangTags = alternates
    .map(
      (alt) =>
        `<link rel="alternate" hreflang="${escapeHtmlAttr(alt.hreflang)}" href="${escapeHtmlAttr(alt.href)}" />`
    )
    .join('\n    ');

  const robotsTag = `<meta name="robots" content="${escapeHtmlAttr(page.robots || 'index,follow')}" />`;

  let out = html
    .replace(
      /<html[^>]*>/i,
      `<html lang="${escapeHtmlAttr(langMeta.hreflang)}" dir="${langMeta.dir}" class="dark">`
    )
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(page.title)}</title>`)
    .replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${escapeHtmlAttr(page.description)}" />`
    )
    .replace(
      /<link\s+rel="canonical"[^>]*>/i,
      `<link rel="canonical" href="${escapeHtmlAttr(page.canonicalUrl)}" />`
    )
    .replace(
      /<meta\s+property="og:url"[^>]*>/i,
      `<meta property="og:url" content="${escapeHtmlAttr(page.canonicalUrl)}" />`
    )
    .replace(
      /<meta\s+property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${escapeHtmlAttr(page.title)}" />`
    )
    .replace(
      /<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${escapeHtmlAttr(page.description)}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${escapeHtmlAttr(page.title)}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${escapeHtmlAttr(page.description)}" />`
    )
    .replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
      `<script type="application/ld+json">\n${safeJsonLd(page.structuredData)}\n    </script>`
    );

  const injectedHeadExtras = [robotsTag, hreflangTags].filter(Boolean).join('\n    ');
  if (injectedHeadExtras) {
    out = out.replace('</head>', `    ${injectedHeadExtras}\n  </head>`);
  }

  return out;
}
