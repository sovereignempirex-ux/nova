# NOVA Advanced SEO Engine Architecture

Base Origin: `https://nova.vanitasbot.my.id`  
Admin Console: `/seo-admin` (Protected by Firebase Admin RBAC + `noindex,nofollow`)

## 1. Server-Side HTML Metadata Injection (`server/seo/ssrMeta.ts`)
Every HTML document served in development and production runs through `injectSeoIntoHtml(html, requestPath, siteOrigin)`:
- Sets `<html lang="..." dir="ltr|rtl">` matching the page language.
- Injects unique `<title>`, `<meta name="description">`, `<link rel="canonical">`, `<meta name="robots">`, OpenGraph (`og:url`, `og:title`, `og:description`), and Twitter Card tags.
- Injects `<link rel="alternate" hreflang="..." href="...">` + `x-default` strictly for **published, indexable** pages sharing an `hreflangGroup`. Untranslated languages are never emitted.
- Embeds validated Schema.org JSON-LD `@graph` (`BreadcrumbList`, `SoftwareApplication` or `Article`, and `FAQPage` only when genuine FAQs exist on the page). Fake `aggregateRating`/`reviewCount` fields are explicitly rejected by `validateStructuredData()`.

## 2. Dynamic Crawl Artifacts (`server/seo/sitemapGenerator.ts`)
Served dynamically from Express ahead of static assets:
- `GET /robots.txt`: Allows public routes, disallows `/api/`, `/admin`, `/seo-admin`, points to `Sitemap: https://nova.vanitasbot.my.id/sitemap.xml`.
- `GET /sitemap.xml`: XML Sitemap Index linking:
  - `/sitemaps/core.xml`
  - `/sitemaps/tools.xml`
  - `/sitemaps/models.xml`
  - `/sitemaps/guides.xml`
  - `/sitemaps/intl.xml`

## 3. 39-Language International SEO (`shared/languages.ts`)
Supports 39 ISO/BCP-47 locales (`en`, `ar`, `fr`, `es`, `de`, `ja`, `ko`, `zh-CN`, `zh-TW`, `pt`, `it`, `ru`, `tr`, `id`, `hi`, `nl`, `pl`, `sv`, `no`, `da`, `fi`, `el`, `cs`, `ro`, `hu`, `uk`, `vi`, `th`, `ms`, `bn`, `ur`, `fa`, `he`, `ta`, `te`, `fil`, `sw`, `af`, `ca`), with `rtl` layout directionality for `ar`, `ur`, `fa`, and `he`.

## 4. Measurable Internal SEO Scoring (`server/seo/seoAudit.ts`)
Every page receives an objective internal score out of 100 across 7 categories with explicit deduction reasons:
1. Metadata (25 pts): Title length `25–68`, Description length `90–170`, duplicate detection.
2. Technical SEO (20 pts): Valid canonical URL, lowercase clean path, robots directive.
3. Content Quality (20 pts): Non-empty `h1`, body >= 120 chars (full score >= 240 chars).
4. Internal Links (10 pts): >= 2 valid internal links.
5. International SEO (10 pts): Valid supported language code + `hreflangGroup`.
6. Structured Data (10 pts): Valid JSON-LD `@context` & `@graph`, no fake rating markup.
7. Performance (5 pts): Reasonable payload weight.

## 5. Google Search Console & Indexing State Separation
- NOVA tracks internal publication status (`published`, `draft`, `archived`) separately from indexing state (`published`, `sitemap_submitted`, `discovered`, `crawled`, `indexed`, `excluded`, `error`).
- Search Console endpoints (`/api/admin/seo/gsc/*`) call Google Search Console v3/v1 APIs directly using either Service Account JWT (`GSC_CLIENT_EMAIL` + `GSC_PRIVATE_KEY`) or an admin OAuth Webmasters Bearer token. Zero fake analytics rows are ever generated.
