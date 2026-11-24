import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Globe,
  Link2,
  LogIn,
  Play,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../lib/AuthContext';
import { novaApi, type SeoPageItem } from '../lib/apiClient';

type SeoTab = 'audit' | 'languages' | 'assistant' | 'redirects' | 'gsc';

export const SeoAdminPage: React.FC = () => {
  usePageMeta(
    'NOVA Advanced SEO Audit Console',
    'Internal SEO scoring with explicit deductions, 39-language coverage, structured data validator, redirects, and Google Search Console.',
    '/seo-admin',
    { robots: 'noindex,nofollow' }
  );

  const { user, authReady, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<SeoTab>('audit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalPublicPages: number;
    indexablePages: number;
    avgInternalScore: number;
    missingTitles: number;
    missingDescriptions: number;
    duplicateMetadata: number;
    brokenInternalLinks: number;
    missingCanonicals: number;
    invalidHreflang: number;
    missingTranslations: number;
    sitemapErrors: number;
    structuredDataErrors: number;
    thinContentPages: number;
  } | null>(null);
  const [pages, setPages] = useState<SeoPageItem[]>([]);
  const [languages, setLanguages] = useState<
    Array<{
      code: string;
      name: string;
      nativeName: string;
      dir: 'ltr' | 'rtl';
      hreflang: string;
      publishedPages: number;
      hasPublishedSeo: boolean;
    }>
  >([]);
  const [redirects, setRedirects] = useState<
    Array<{ id: string; sourcePath: string; targetPath: string; statusCode: number; active: boolean }>
  >([]);
  const [automationLogs, setAutomationLogs] = useState<
    Array<{ id: string; jobType: string; status: string; pagesScanned: number; issuesFound: number; summary: string; createdAt: string }>
  >([]);
  const [gscStatus, setGscStatus] = useState<{
    siteUrl: string;
    serviceAccountConfigured: boolean;
    clientEmail: string | null;
    message: string;
  } | null>(null);

  // Filters & selected page inspection
  const [filterType, setFilterType] = useState('');
  const [filterLang, setFilterLang] = useState('');
  const [selectedPage, setSelectedPage] = useState<SeoPageItem | null>(null);

  // AI Draft Assistant state
  const [aiTopic, setAiTopic] = useState('/fr/tools/image-enhancer');
  const [aiLang, setAiLang] = useState('fr');
  const [aiLoading, setAiLoading] = useState(false);
  const [draft, setDraft] = useState<{
    targetLanguage: string;
    providerUsed: string;
    modelUsed: string;
    title: string;
    description: string;
    h1: string;
    contentMarkdown: string;
    faqs: Array<{ question: string; answer: string }>;
    notes: string;
  } | null>(null);
  const [draftPath, setDraftPath] = useState('/fr/tools/image-enhancer');
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);

  // Redirect creation state
  const [redirSrc, setRedirSrc] = useState('');
  const [redirDst, setRedirDst] = useState('');

  // Search Console state
  const [gscToken, setGscToken] = useState('');
  const [gscDimension, setGscDimension] = useState<'query' | 'page' | 'country' | 'device'>('query');
  const [gscRows, setGscRows] = useState<
    Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>
  >([]);
  const [inspectTarget, setInspectTarget] = useState('https://nova.vanitasbot.my.id/');
  const [inspectResult, setInspectResult] = useState<Record<string, unknown> | null>(null);
  const [gscActionMsg, setGscActionMsg] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const report = await novaApi.adminSeo.getAudit(token);
      setSummary(report.summary);
      setPages(report.pages);
      setLanguages(report.languageCoverage);
      setRedirects(report.redirects);
      setAutomationLogs(report.automationLogs);
      setGscStatus(report.gsc);
      if (!selectedPage && report.pages[0]) {
        setSelectedPage(report.pages[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SEO audit.');
    } finally {
      setLoading(false);
    }
  }, [user, selectedPage]);

  useEffect(() => {
    if (authReady && user) {
      void loadAudit();
    }
  }, [authReady, user, loadAudit]);

  const handleRunAutomation = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      await novaApi.adminSeo.runAutomation(token);
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Automation run failed.');
      setLoading(false);
    }
  };

  const handleDeletePage = async (page: SeoPageItem) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await novaApi.adminSeo.deletePage(token, page.id, '/');
      setSelectedPage(null);
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove page.');
    }
  };

  const handleGenerateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAiLoading(true);
    setError(null);
    setPublishFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await novaApi.adminSeo.generateAiDraft(token, {
        topicOrPath: aiTopic,
        targetLang: aiLang,
      });
      setDraft(res.draft);
      setDraftPath(aiTopic.startsWith('/') ? aiTopic : `/${aiLang}/tools/${aiTopic}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI SEO draft.');
    } finally {
      setAiLoading(false);
    }
  };

  const handlePublishDraft = async () => {
    if (!user || !draft) return;
    setError(null);
    setPublishFeedback(null);
    try {
      const token = await user.getIdToken();
      const slug = draftPath.split('/').filter(Boolean).pop() || 'custom-page';
      const saved = await novaApi.adminSeo.savePage(token, {
        slug,
        path: draftPath,
        pageType: draftPath.includes('/tools/') ? 'programmatic_tool' : 'guide',
        lang: draft.targetLanguage,
        hreflangGroup: draftPath.includes('/tools/') ? `tool-${slug}` : undefined,
        title: draft.title,
        description: draft.description,
        h1: draft.h1,
        contentMarkdown: draft.contentMarkdown,
        faqs: draft.faqs,
        status: 'published',
      });
      setPublishFeedback(`Published ${saved.page.path} (SEO Score ${saved.page.seoScore}/100) and updated sitemap.`);
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish draft.');
    }
  };

  const handleAddRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await novaApi.adminSeo.createRedirect(token, {
        sourcePath: redirSrc,
        targetPath: redirDst,
        statusCode: 301,
      });
      setRedirSrc('');
      setRedirDst('');
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create redirect.');
    }
  };

  const handleQueryGsc = async () => {
    if (!user) return;
    setError(null);
    setGscActionMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await novaApi.adminSeo.gscAnalytics(
        token,
        { dimensions: [gscDimension] },
        gscToken || undefined
      );
      setGscRows(res.rows);
      setGscActionMsg(`Fetched ${res.rows.length} rows (${res.startDate} → ${res.endDate}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search Console query failed.');
    }
  };

  const handleSubmitSitemap = async () => {
    if (!user) return;
    setError(null);
    setGscActionMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await novaApi.adminSeo.gscSubmitSitemap(token, undefined, gscToken || undefined);
      setGscActionMsg(`Sitemap submitted to Google Search Console: ${res.sitemapUrl}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sitemap submission failed.');
    }
  };

  const handleInspectUrl = async () => {
    if (!user) return;
    setError(null);
    setGscActionMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await novaApi.adminSeo.gscInspectUrl(token, inspectTarget, gscToken || undefined);
      setInspectResult(res.inspectionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'URL inspection failed.');
    }
  };

  if (!authReady) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12">
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-8 text-center space-y-4">
          <Shield className="w-10 h-10 text-blue-500 mx-auto" />
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            SEO Control Plane Sign-In Required
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Sign in with your administrator Google account to access NOVA&apos;s SEO audit diagnostics, 39-language publishing workflow, and Google Search Console reports.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <LogIn className="w-4 h-4" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const filteredPages = pages.filter((p) => {
    if (filterType && p.pageType !== filterType) return false;
    if (filterLang && p.lang !== filterLang) return false;
    return true;
  });

  const tabs: Array<{ id: SeoTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'audit', label: 'Audit & Scoring', icon: Search },
    { id: 'languages', label: '39-Language Matrix', icon: Globe },
    { id: 'assistant', label: 'AI SEO Assistant', icon: Bot },
    { id: 'redirects', label: 'Redirects & Automation', icon: Link2 },
    { id: 'gsc', label: 'Google Search Console', icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-mono text-slate-500">
            NOVA Advanced SEO Engine · Dynamic Sitemaps &amp; SSR Metadata
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
            SEO Audit &amp; Internationalization Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            /sitemap.xml
          </a>
          <button
            type="button"
            onClick={() => void handleRunAutomation()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Full Audit
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
            <p className="text-xs text-slate-500">Internal SEO Score (Avg)</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {summary.avgInternalScore}/100
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
            <p className="text-xs text-slate-500">Published / Indexable</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {summary.totalPublicPages} / {summary.indexablePages}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
            <p className="text-xs text-slate-500">Metadata / Schema Errors</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {summary.duplicateMetadata + summary.structuredDataErrors}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
            <p className="text-xs text-slate-500">Thin / Broken Links</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {summary.thinContentPages} / {summary.brokenInternalLinks}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
            <p className="text-xs text-slate-500">Unpublished Languages</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {summary.missingTranslations} / {languages.length}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* AUDIT & SCORING */}
      {tab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                <option value="">All Page Types</option>
                <option value="core">core</option>
                <option value="tool">tool</option>
                <option value="programmatic_tool">programmatic_tool</option>
                <option value="model">model</option>
                <option value="category">category</option>
                <option value="doc">doc</option>
                <option value="guide">guide</option>
              </select>
              <select
                value={filterLang}
                onChange={(e) => setFilterLang(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                <option value="">All Languages</option>
                {languages.filter((l) => l.hasPublishedSeo).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Path</th>
                    <th className="py-3 px-4">Lang</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Robots</th>
                    <th className="py-3 px-4 text-right">Internal Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredPages.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPage(p)}
                      className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        selectedPage?.id === p.id ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-slate-900 dark:text-slate-100">{p.path}</td>
                      <td className="py-2.5 px-4 font-mono">{p.lang}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{p.pageType}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{p.robots}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {p.seoScore}/100
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Score Breakdown Inspector */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4 h-fit">
            {selectedPage ? (
              <>
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-500 truncate">{selectedPage.path}</p>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
                      {selectedPage.title}
                    </h2>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {selectedPage.seoScore}/100
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedPage.scoreBreakdown.map((cat) => (
                    <div key={cat.category} className="text-xs space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>{cat.category}</span>
                        <span className="font-mono tabular-nums">
                          {cat.score}/{cat.maxScore}
                        </span>
                      </div>
                      {cat.deductions.length > 0 && (
                        <ul className="text-amber-600 dark:text-amber-400 space-y-0.5 ps-3 list-disc">
                          {cat.deductions.map((d, idx) => (
                            <li key={idx}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {selectedPage.pageType !== 'core' && (
                  <button
                    type="button"
                    onClick={() => void handleDeletePage(selectedPage)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove &amp; 301 Redirect to /
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">Select a page row to inspect measurable SEO score deductions.</p>
            )}
          </div>
        </div>
      )}

      {/* 39-LANGUAGE MATRIX */}
      {tab === 'languages' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            NOVA supports all 39 configured locales with proper LTR/RTL rendering and strict hreflang discipline: hreflang alternates are emitted ONLY for genuinely published translations.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {languages.map((l) => (
              <div
                key={l.code}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {l.nativeName} · {l.name}
                  </p>
                  <p className="text-xs font-mono text-slate-500">
                    {l.code} · hreflang={l.hreflang} · {l.dir.toUpperCase()}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-xs font-mono tabular-nums">
                    {l.publishedPages} page{l.publishedPages === 1 ? '' : 's'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAiLang(l.code);
                      setAiTopic(`/${l.code}/tools/ai-chat`);
                      setTab('assistant');
                    }}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Draft SEO
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI SEO CONTENT ASSISTANT */}
      {tab === 'assistant' && (
        <div className="space-y-6">
          <form
            onSubmit={handleGenerateDraft}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4"
          >
            <p className="text-xs text-slate-600 dark:text-slate-400">
              AI-generated drafts are returned for editorial review and are never auto-published.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="/fr/tools/image-enhancer"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <select
                value={aiLang}
                onChange={(e) => setAiLang(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} — {l.name} ({l.nativeName})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={aiLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {aiLoading ? 'Generating Draft...' : 'Generate Draft'}
              </button>
            </div>
          </form>

          {draft && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500">
                <span>
                  Review Draft · Provider: {draft.providerUsed} · Model: {draft.modelUsed}
                </span>
                <span>{draft.notes}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500">Target URL Path</span>
                  <input
                    type="text"
                    value={draftPath}
                    onChange={(e) => setDraftPath(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Meta Title ({draft.title.length} chars)</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-slate-500">Meta Description ({draft.description.length} chars)</span>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-slate-500">Body Copy ({draft.contentMarkdown.length} chars)</span>
                  <textarea
                    rows={4}
                    value={draft.contentMarkdown}
                    onChange={(e) => setDraft({ ...draft, contentMarkdown: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-4">
                {publishFeedback && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{publishFeedback}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handlePublishDraft()}
                  className="ms-auto px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Approve &amp; Publish to Sitemap
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REDIRECTS & AUTOMATION */}
      {tab === 'redirects' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              301 Redirect Manager
            </h2>
            <form onSubmit={handleAddRedirect} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={redirSrc}
                onChange={(e) => setRedirSrc(e.target.value)}
                placeholder="/old-path"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <input
                type="text"
                value={redirDst}
                onChange={(e) => setRedirDst(e.target.value)}
                placeholder="/new-path"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add 301
              </button>
            </form>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
              {redirects.length === 0 ? (
                <p className="py-4 text-slate-500 font-sans">No active redirect rules configured.</p>
              ) : (
                redirects.map((r) => (
                  <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                    <span>
                      {r.statusCode} · {r.sourcePath} → {r.targetPath}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        user &&
                        void user
                          .getIdToken()
                          .then((t) => novaApi.adminSeo.deleteRedirect(t, r.id))
                          .then(() => loadAudit())
                      }
                      className="text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              SEO Automation Logs
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {automationLogs.map((log) => (
                <div key={log.id} className="py-2.5 space-y-0.5">
                  <div className="flex justify-between font-mono text-slate-500">
                    <span>{log.jobType}</span>
                    <span className="tabular-nums">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{log.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE SEARCH CONSOLE */}
      {tab === 'gsc' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Google Search Console Integration
                </h2>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  Property: {gscStatus?.siteUrl || 'https://nova.vanitasbot.my.id/'} · Service Account:{' '}
                  {gscStatus?.serviceAccountConfigured ? 'Configured' : 'Not Configured'}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {gscStatus?.message} Real Search Console data is shown only when verified credentials or an admin OAuth Webmasters token are supplied — NOVA never fabricates Search Console clicks or impressions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="password"
                value={gscToken}
                onChange={(e) => setGscToken(e.target.value)}
                placeholder="Optional OAuth Webmasters Bearer Token"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <select
                value={gscDimension}
                onChange={(e) => setGscDimension(e.target.value as 'query' | 'page' | 'country' | 'device')}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                <option value="query">Dimension: Top Queries</option>
                <option value="page">Dimension: Top Pages</option>
                <option value="country">Dimension: Countries</option>
                <option value="device">Dimension: Devices</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleQueryGsc()}
                  className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Fetch Performance
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitSitemap()}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Submit Sitemap
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input
                type="url"
                value={inspectTarget}
                onChange={(e) => setInspectTarget(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => void handleInspectUrl()}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Inspect URL Indexing
              </button>
            </div>

            {gscActionMsg && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{gscActionMsg}</p>
            )}
          </div>

          {gscRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-4">{gscDimension}</th>
                    <th className="py-3 px-4 text-right">Clicks</th>
                    <th className="py-3 px-4 text-right">Impressions</th>
                    <th className="py-3 px-4 text-right">CTR</th>
                    <th className="py-3 px-4 text-right">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {gscRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4">{row.keys.join(' · ')}</td>
                      <td className="py-2.5 px-4 text-right">{row.clicks}</td>
                      <td className="py-2.5 px-4 text-right">{row.impressions}</td>
                      <td className="py-2.5 px-4 text-right">{(row.ctr * 100).toFixed(2)}%</td>
                      <td className="py-2.5 px-4 text-right">{row.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {inspectResult && (
            <pre className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4 text-xs font-mono overflow-x-auto">
              {JSON.stringify(inspectResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
