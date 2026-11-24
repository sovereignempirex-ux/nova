import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, BookOpen } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { novaApi, type GatewayProviderItem, type SeoPageItem } from '../lib/apiClient';

export const DocsGuidePage: React.FC = () => {
  const location = useLocation();
  const [page, setPage] = useState<SeoPageItem | null>(null);
  const [docs, setDocs] = useState<{
    generatedAt: string;
    providers: GatewayProviderItem[];
  } | null>(null);
  const [catalog, setCatalog] = useState<SeoPageItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const tasks: Promise<unknown>[] = [
      novaApi.seoPublic.getPage(location.pathname).then((r) => setPage(r.page)).catch(() => setPage(null)),
    ];
    if (location.pathname.startsWith('/docs/')) {
      tasks.push(novaApi.gatewayPublic.getDocs().then(setDocs).catch(() => setDocs(null)));
    } else {
      setDocs(null);
    }
    if (location.pathname.startsWith('/categories/')) {
      tasks.push(novaApi.seoPublic.getCatalog().then((r) => setCatalog(r.pages)).catch(() => setCatalog([])));
    } else {
      setCatalog([]);
    }
    Promise.allSettled(tasks).finally(() => setLoading(false));
  }, [location.pathname]);

  usePageMeta(
    page?.title || 'NOVA Documentation & Guides',
    page?.description || 'Technical documentation and verified integration guides for NOVA.',
    location.pathname,
    {
      robots: page?.robots || 'index,follow',
      structuredData: page?.structuredData,
    }
  );

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10 space-y-8">
      <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6">
        <p className="text-xs font-mono text-slate-500">
          NOVA Reference · {location.pathname}
        </p>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-blue-500 shrink-0" />
          <span>{page?.h1 || 'NOVA Technical Documentation'}</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {page?.description || 'Live documentation synchronized with the NOVA API Gateway registry.'}
        </p>
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-36 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      )}

      {!loading && page?.contentMarkdown && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.contentMarkdown}</ReactMarkdown>
          </div>
        </section>
      )}

      {!loading && docs && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              Live Gateway Endpoints Reference
            </h2>
            <span className="text-xs font-mono text-slate-500">
              Synced: {new Date(docs.generatedAt).toLocaleString()}
            </span>
          </div>
          {docs.providers.map((provider) => (
            <div
              key={provider.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {provider.name} ({provider.slug})
                  </h3>
                  <p className="text-xs font-mono text-slate-500">{provider.baseUrl}</p>
                </div>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  Health: {provider.healthStatus}
                </span>
              </div>
              {provider.endpoints.length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-2">
                  {provider.endpoints.map((ep) => (
                    <div key={ep.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {ep.method} {ep.path}
                        </span>
                        <span className="text-slate-500">{ep.capability}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{ep.exampleRequest}</p>
                      {ep.knownLimitations && (
                        <p className="text-amber-600 dark:text-amber-400">{ep.knownLimitations}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {!loading && catalog.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Published Directory Entries
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] hover:border-blue-500"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.h1}</p>
                  <p className="text-xs font-mono text-slate-500 truncate">
                    {item.path} · {item.lang}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
