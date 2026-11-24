import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, Cpu } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { novaApi, type GatewayModelItem, type SeoPageItem } from '../lib/apiClient';

export const ModelDetailPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const path = `/models/${slug}`;
  const [seoPage, setSeoPage] = useState<SeoPageItem | null>(null);
  const [model, setModel] = useState<GatewayModelItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([novaApi.seoPublic.getPage(path), novaApi.gatewayPublic.getCatalog()])
      .then(([seoRes, catRes]) => {
        if (seoRes.status === 'fulfilled') setSeoPage(seoRes.value.page);
        if (catRes.status === 'fulfilled') {
          const matched = catRes.value.models.find(
            (m) => m.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === slug
          );
          setModel(matched || null);
        }
      })
      .finally(() => setLoading(false));
  }, [path, slug]);

  usePageMeta(
    seoPage?.title || `${model?.name || slug} | NOVA Model Spec`,
    seoPage?.description || 'Verified model capabilities and Gateway specification in NOVA.',
    path,
    {
      robots: seoPage?.robots || 'index,follow',
      structuredData: seoPage?.structuredData,
    }
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-12 space-y-4">
        <div className="h-8 w-1/2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-40 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10 space-y-8">
      <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6">
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Model Directory · {model?.providerSlug || 'nova_gateway'} · {model?.tier || 'free'}
        </p>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Cpu className="w-7 h-7 text-blue-500 shrink-0" />
          <span>{model?.name || seoPage?.h1 || slug}</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {model?.description || seoPage?.description}
        </p>
      </div>

      {model ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-2">
            <h2 className="text-xs font-semibold text-slate-500">
              Verified Capabilities &amp; I/O
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Model Identifier</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{model.modelIdentifier}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Capabilities</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{model.capabilities.join(', ')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Inputs → Outputs</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">
                  {model.inputTypes.join('/')} → {model.outputTypes.join('/')}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Streaming</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">
                  {model.streamingSupport ? 'SSE / Streaming' : 'Standard JSON'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Verified Status</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">
                  {model.verified ? 'Verified Live' : 'Pending / Conditional'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500">
              Supported Languages &amp; Launch
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-mono">
              {model.supportedLanguages.join(', ')}
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              {model.capabilities.includes('text-to-image') || model.capabilities.includes('image_generation') ? (
                <Link
                  to="/image-studio"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Open in Image Studio
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              ) : null}
              {model.capabilities.includes('text_generation') ? (
                <Link
                  to="/ai-studio"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Open in AI Studio
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-500">
          Model specification was not found in the active Gateway catalog.
        </div>
      )}

      {seoPage?.contentMarkdown && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seoPage.contentMarkdown}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
};
