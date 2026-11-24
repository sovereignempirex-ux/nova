import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, CheckCircle2, Globe } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useLanguage } from '../lib/LanguageContext';
import { novaApi, type SeoPageItem } from '../lib/apiClient';

const TOOL_ROUTE_MAP: Record<string, string> = {
  'ai-chat': '/ai-studio',
  'image-generator': '/image-studio',
  'image-enhancer': '/image-enhancer',
  'media-downloader': '/downloader',
  'multi-search': '/search',
  'video-player': '/watch',
};

export const ProgrammaticToolPage: React.FC = () => {
  const { lang = 'en', slug = 'ai-chat' } = useParams<{ lang: string; slug: string }>();
  const path = `/${lang}/tools/${slug}`;
  const { setLang } = useLanguage();
  const [page, setPage] = useState<
    (SeoPageItem & {
      alternates: Array<{ hreflang: string; href: string }>;
      langMeta: { code: string; name: string; nativeName: string; dir: 'ltr' | 'rtl'; hreflang: string };
    }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    novaApi.seoPublic
      .getPage(path)
      .then((res) => {
        setPage(res.page);
        if (res.page.langMeta?.code) {
          setLang(res.page.langMeta.code);
        }
      })
      .catch((err) => {
        setPage(null);
        setError(err instanceof Error ? err.message : 'Localized page is not published.');
      })
      .finally(() => setLoading(false));
  }, [path, setLang]);

  usePageMeta(
    page?.title || `${slug} (${lang.toUpperCase()}) | NOVA`,
    page?.description || 'NOVA multilingual AI and creative workspace module.',
    path,
    {
      robots: page?.robots || 'noindex,follow',
      structuredData: page?.structuredData,
    }
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-12 space-y-4">
        <div className="h-8 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-24 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-16 space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Localized Page Not Published
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {error || `No verified translation is published yet for ${path}.`} NOVA does not emit fake translations or unverified hreflang entries.
        </p>
        <Link
          to={TOOL_ROUTE_MAP[slug] || '/'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Open Workspace Tool
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>
    );
  }

  const workspaceRoute = TOOL_ROUTE_MAP[slug] || '/';

  return (
    <div dir={page.langMeta.dir} className="max-w-4xl mx-auto px-4 lg:px-8 py-10 space-y-8">
      <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6">
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
          NOVA · {page.langMeta.nativeName} ({page.langMeta.code}) · {page.pageType}
        </p>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
          {page.h1}
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          {page.description}
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Link
            to={workspaceRoute}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Launch {slug.replace(/-/g, ' ')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Free · Vanitas Ecosystem · Canonical: {page.canonicalUrl}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Overview &amp; Capabilities
        </h2>
        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.contentMarkdown}</ReactMarkdown>
        </div>
      </section>

      {page.faqs && page.faqs.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {page.faqs.map((faq, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <span>{faq.question}</span>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 ps-6">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {page.alternates && page.alternates.length > 1 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            Published Language Editions (hreflang)
          </h2>
          <div className="flex flex-wrap gap-2">
            {page.alternates
              .filter((a) => a.hreflang !== 'x-default')
              .map((alt) => {
                const altPath = new URL(alt.href).pathname;
                return (
                  <Link
                    key={alt.hreflang}
                    to={altPath}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-blue-500"
                  >
                    {alt.hreflang}
                  </Link>
                );
              })}
          </div>
        </section>
      )}

      {page.internalLinks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Related NOVA Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {page.internalLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] text-sm text-slate-800 dark:text-slate-200 hover:border-blue-500 transition-colors"
              >
                <span className="truncate">{link.label}</span>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
