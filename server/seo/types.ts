export type SeoPageType =
  | 'core'
  | 'tool'
  | 'programmatic_tool'
  | 'model'
  | 'category'
  | 'doc'
  | 'guide'
  | 'anime';

export type SeoPublicationStatus = 'draft' | 'published' | 'archived';

export type SeoIndexingStatus =
  | 'published'
  | 'sitemap_submitted'
  | 'discovered'
  | 'crawled'
  | 'indexed'
  | 'excluded'
  | 'error';

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface SeoScoreCategory {
  category:
    | 'Metadata'
    | 'Technical SEO'
    | 'Content Quality'
    | 'Internal Links'
    | 'International SEO'
    | 'Structured Data'
    | 'Performance';
  score: number;
  maxScore: number;
  deductions: string[];
}

export interface SeoPageRecord {
  id: string;
  slug: string;
  path: string;
  pageType: SeoPageType;
  lang: string;
  hreflangGroup?: string;
  title: string;
  description: string;
  h1: string;
  canonicalUrl: string;
  ogImage?: string;
  robots: string;
  status: SeoPublicationStatus;
  indexingStatus: SeoIndexingStatus;
  contentMarkdown: string;
  faqs?: SeoFaqItem[];
  internalLinks: Array<{ label: string; path: string }>;
  structuredData: Record<string, unknown>;
  seoScore: number;
  scoreBreakdown: SeoScoreCategory[];
  publishedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface SeoRedirectRule {
  id: string;
  sourcePath: string;
  targetPath: string;
  statusCode: 301 | 302 | 307 | 308;
  active: boolean;
  createdAt: string;
}

export interface SeoAutomationLog {
  id: string;
  jobType: string;
  status: 'completed' | 'failed' | 'skipped';
  pagesScanned: number;
  issuesFound: number;
  summary: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
