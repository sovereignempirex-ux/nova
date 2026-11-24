import { isValidLanguageCode, SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import type { SeoPageRecord, SeoScoreCategory } from './types.ts';

export function buildStructuredDataForPage(
  page: Pick<SeoPageRecord, 'pageType' | 'title' | 'description' | 'canonicalUrl' | 'path' | 'lang' | 'faqs'>,
  siteOrigin: string
): Record<string, unknown> {
  const baseGraph: Array<Record<string, unknown>> = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'NOVA',
          item: `${siteOrigin}/`,
        },
        ...(page.path !== '/'
          ? [
              {
                '@type': 'ListItem',
                position: 2,
                name: page.title,
                item: page.canonicalUrl,
              },
            ]
          : []),
      ],
    },
  ];

  if (page.pageType === 'core' || page.pageType === 'tool' || page.pageType === 'programmatic_tool' || page.pageType === 'model') {
    baseGraph.push({
      '@type': 'SoftwareApplication',
      name: page.title,
      url: page.canonicalUrl,
      inLanguage: page.lang,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'All',
      description: page.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
  } else {
    baseGraph.push({
      '@type': 'Article',
      headline: page.title,
      description: page.description,
      inLanguage: page.lang,
      mainEntityOfPage: page.canonicalUrl,
      publisher: {
        '@type': 'Organization',
        name: 'NOVA · Vanitas Ecosystem',
        url: siteOrigin,
      },
    });
  }

  if (page.faqs && page.faqs.length > 0) {
    baseGraph.push({
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': baseGraph,
  };
}

export function validateStructuredData(sd: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!sd || sd['@context'] !== 'https://schema.org') {
    errors.push('Missing @context "https://schema.org"');
  }
  const graph = sd['@graph'];
  if (!Array.isArray(graph) || graph.length === 0) {
    errors.push('Structured data @graph is empty.');
  } else {
    for (const node of graph) {
      if (!node || typeof node !== 'object' || !('@type' in node)) {
        errors.push('Structured data node missing @type.');
      }
    }
  }
  const serialized = JSON.stringify(sd);
  if (/aggregateRating|reviewCount/i.test(serialized)) {
    errors.push('Fake rating/review markup is prohibited.');
  }
  return errors;
}

export function recommendInternalLinksForPage(
  target: Pick<SeoPageRecord, 'path' | 'pageType' | 'lang'>,
  allPages: SeoPageRecord[]
): Array<{ label: string; path: string }> {
  const candidates = allPages.filter(
    (p) => p.status === 'published' && p.path !== target.path && !p.robots.includes('noindex')
  );

  // Prefer same language, then English fallback
  const sameLang = candidates.filter((p) => p.lang === target.lang);
  const pool = sameLang.length >= 3 ? sameLang : candidates.filter((p) => p.lang === target.lang || p.lang === 'en');

  const prioritized = pool.sort((a, b) => {
    if (target.pageType === 'model' && a.pageType === 'tool' && b.pageType !== 'tool') return -1;
    if (target.pageType === 'tool' && a.pageType === 'model' && b.pageType !== 'model') return -1;
    if (a.lang === target.lang && b.lang !== target.lang) return -1;
    return 0;
  });

  return prioritized.slice(0, 4).map((p) => ({
    label: p.h1 || p.title,
    path: p.path,
  }));
}

export function scoreSeoPage(
  page: SeoPageRecord,
  allPages: SeoPageRecord[]
): { totalScore: number; breakdown: SeoScoreCategory[] } {
  const breakdown: SeoScoreCategory[] = [];

  // 1. Metadata (25 pts)
  let metaScore = 25;
  const metaDeductions: string[] = [];
  const titleLen = page.title.trim().length;
  const descLen = page.description.trim().length;

  if (titleLen === 0) {
    metaScore -= 12;
    metaDeductions.push('Missing page title (-12)');
  } else if (titleLen < 25 || titleLen > 68) {
    metaScore -= 4;
    metaDeductions.push(`Title length ${titleLen} chars outside ideal 25–68 char window (-4)`);
  }

  if (descLen === 0) {
    metaScore -= 10;
    metaDeductions.push('Missing meta description (-10)');
  } else if (descLen < 90 || descLen > 170) {
    metaScore -= 4;
    metaDeductions.push(`Description length ${descLen} chars outside ideal 90–170 char window (-4)`);
  }

  const dupTitle = allPages.some(
    (other) => other.id !== page.id && other.status === 'published' && other.title.toLowerCase() === page.title.toLowerCase()
  );
  if (dupTitle) {
    metaScore -= 5;
    metaDeductions.push('Duplicate title across published pages (-5)');
  }

  const dupDesc = allPages.some(
    (other) =>
      other.id !== page.id && other.status === 'published' && other.description.toLowerCase() === page.description.toLowerCase()
  );
  if (dupDesc) {
    metaScore -= 5;
    metaDeductions.push('Duplicate meta description across published pages (-5)');
  }

  breakdown.push({
    category: 'Metadata',
    score: Math.max(0, metaScore),
    maxScore: 25,
    deductions: metaDeductions,
  });

  // 2. Technical SEO (20 pts)
  let techScore = 20;
  const techDeductions: string[] = [];
  if (!page.canonicalUrl || !/^https?:\/\//i.test(page.canonicalUrl)) {
    techScore -= 10;
    techDeductions.push('Missing or invalid canonical URL (-10)');
  }
  if (!page.path.startsWith('/') || /[A-Z\s]/.test(page.path)) {
    techScore -= 5;
    techDeductions.push('URL path should be lowercase and clean (-5)');
  }
  if (!page.robots) {
    techScore -= 5;
    techDeductions.push('Missing robots directive (-5)');
  }
  breakdown.push({
    category: 'Technical SEO',
    score: Math.max(0, techScore),
    maxScore: 20,
    deductions: techDeductions,
  });

  // 3. Content Quality (20 pts)
  let contentScore = 20;
  const contentDeductions: string[] = [];
  if (!page.h1?.trim()) {
    contentScore -= 6;
    contentDeductions.push('Missing primary H1 heading (-6)');
  }
  const bodyLen = page.contentMarkdown.trim().length;
  if (bodyLen < 120) {
    contentScore -= 14;
    contentDeductions.push('Thin content: body is shorter than 120 characters (-14)');
  } else if (bodyLen < 240) {
    contentScore -= 5;
    contentDeductions.push('Content could be expanded above 240 characters (-5)');
  }
  breakdown.push({
    category: 'Content Quality',
    score: Math.max(0, contentScore),
    maxScore: 20,
    deductions: contentDeductions,
  });

  // 4. Internal Links (10 pts)
  let linkScore = 10;
  const linkDeductions: string[] = [];
  const validPaths = new Set(allPages.map((p) => p.path));
  const broken = page.internalLinks.filter((l) => !validPaths.has(l.path) && !l.path.startsWith('/anime'));
  if (page.internalLinks.length < 2) {
    linkScore -= 5;
    linkDeductions.push('Fewer than 2 internal links assigned (-5)');
  }
  if (broken.length > 0) {
    linkScore -= 5;
    linkDeductions.push(`${broken.length} broken internal link(s) detected (-5)`);
  }
  breakdown.push({
    category: 'Internal Links',
    score: Math.max(0, linkScore),
    maxScore: 10,
    deductions: linkDeductions,
  });

  // 5. International SEO (10 pts)
  let intlScore = 10;
  const intlDeductions: string[] = [];
  if (!isValidLanguageCode(page.lang)) {
    intlScore -= 6;
    intlDeductions.push(`Unsupported language code "${page.lang}" (-6)`);
  }
  if (!page.hreflangGroup) {
    intlScore -= 4;
    intlDeductions.push('Not linked to an hreflang translation group (-4)');
  }
  breakdown.push({
    category: 'International SEO',
    score: Math.max(0, intlScore),
    maxScore: 10,
    deductions: intlDeductions,
  });

  // 6. Structured Data (10 pts)
  const sdErrors = validateStructuredData(page.structuredData);
  const sdScore = Math.max(0, 10 - sdErrors.length * 5);
  breakdown.push({
    category: 'Structured Data',
    score: sdScore,
    maxScore: 10,
    deductions: sdErrors.map((e) => `${e} (-5)`),
  });

  // 7. Performance (5 pts)
  let perfScore = 5;
  const perfDeductions: string[] = [];
  if (page.contentMarkdown.length > 50_000) {
    perfScore -= 3;
    perfDeductions.push('Oversized inline markdown document (-3)');
  }
  breakdown.push({
    category: 'Performance',
    score: Math.max(0, perfScore),
    maxScore: 5,
    deductions: perfDeductions,
  });

  const totalScore = breakdown.reduce((sum, c) => sum + c.score, 0);
  return { totalScore, breakdown };
}

export function computeLanguageCoverage(pages: SeoPageRecord[]) {
  const published = pages.filter((p) => p.status === 'published');
  return SUPPORTED_LANGUAGES.map((langDef) => {
    const count = published.filter((p) => p.lang === langDef.code).length;
    return {
      ...langDef,
      publishedPages: count,
      hasPublishedSeo: count > 0,
    };
  });
}
