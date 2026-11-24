import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookText,
  CheckCircle2,
  Compass,
  Cpu,
  Database,
  GitFork,
  LogIn,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Shield,
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../lib/AuthContext';
import {
  novaApi,
  type DetailedAvailabilityStatus,
  type DiscoveredProviderEvaluationItem,
  type GatewayFallbackRuleItem,
  type GatewayLogItem,
  type GatewayModelItem,
  type GatewayProviderItem,
  type HealthMatrixRow,
  type OpenSourceModelEvaluationItem,
  type RouterStatusSummary,
  type SupabasePlatformStats,
} from '../lib/apiClient';

type AdminTab = 'providers' | 'models' | 'health' | 'discovery' | 'logs' | 'fallbacks' | 'docs';

const ALL_CAPABILITIES = [
  'text_generation',
  'image_generation',
  'image_understanding',
  'image_enhancement',
  'text-to-image',
  'search',
  'media_processing',
];

export const AdminConsolePage: React.FC = () => {
  usePageMeta(
    'NOVA API Gateway Admin',
    'Protected NOVA API Gateway registry, provider connectivity tester, logs, circuit breakers, and fallback rules.',
    '/admin',
    { robots: 'noindex,nofollow' }
  );

  const { user, authReady, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<AdminTab>('providers');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<GatewayProviderItem[]>([]);
  const [models, setModels] = useState<GatewayModelItem[]>([]);
  const [fallbackRules, setFallbackRules] = useState<GatewayFallbackRuleItem[]>([]);
  const [logs, setLogs] = useState<GatewayLogItem[]>([]);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [providerFilter, setProviderFilter] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [supabaseStats, setSupabaseStats] = useState<SupabasePlatformStats | null>(null);
  const [testResults, setTestResults] = useState<
    Record<
      string,
      {
        connected: boolean;
        httpStatus: number;
        durationMs: number;
        validationResult: string;
        sample: string | null;
        error: string | null;
      }
    >
  >({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [runningFullSuite, setRunningFullSuite] = useState(false);
  const [testingProviderEpsId, setTestingProviderEpsId] = useState<string | null>(null);
  const [healthMatrix, setHealthMatrix] = useState<HealthMatrixRow[]>([]);
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProviderEvaluationItem[]>([]);
  const [openSourceEvaluations, setOpenSourceEvaluations] = useState<OpenSourceModelEvaluationItem[]>([]);
  const [routerSummary, setRouterSummary] = useState<RouterStatusSummary | null>(null);
  const [suiteMessage, setSuiteMessage] = useState<string | null>(null);
  const [circuits, setCircuits] = useState<
    Array<{ providerSlug: string; state: string; failures: number; openUntil: number | null }>
  >([]);
  const [usage, setUsage] = useState<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgDurationMs: number;
    byProvider: Record<string, { total: number; success: number; failed: number; avgDurationMs: number }>;
  } | null>(null);
  const [docsGeneratedAt, setDocsGeneratedAt] = useState<string | null>(null);

  // Edit Provider inline state
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editProvName, setEditProvName] = useState('');
  const [editProvUrl, setEditProvUrl] = useState('');
  const [editProvApiStyle, setEditProvApiStyle] = useState('');
  const [editProvAuthType, setEditProvAuthType] = useState<GatewayProviderItem['authType']>('none');
  const [editProvCaps, setEditProvCaps] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Provider form
  const [newProvName, setNewProvName] = useState('');
  const [newProvSlug, setNewProvSlug] = useState('');
  const [newProvUrl, setNewProvUrl] = useState('');
  const [newProvCap, setNewProvCap] = useState('text_generation');

  // Add Model form
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelProviderId, setNewModelProviderId] = useState('');
  const [newModelIdentifier, setNewModelIdentifier] = useState('');
  const [newModelCap, setNewModelCap] = useState('text_generation');

  // Add Fallback form
  const [fbCap, setFbCap] = useState('text_generation');
  const [fbPrimarySlug, setFbPrimarySlug] = useState('google_gemini');
  const [fbFallbackSlug, setFbFallbackSlug] = useState('free_ai_custom');
  const [fbFallbackModelId, setFbFallbackModelId] = useState('free_ai_custom:qwen7b');

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [overview, logResp, matrixResp] = await Promise.all([
        novaApi.adminGateway.getOverview(token),
        novaApi.adminGateway.getLogs(token, {
          provider: providerFilter || undefined,
          errorsOnly,
          q: logSearch.trim() || undefined,
        }),
        novaApi.adminGateway.getHealthMatrix(token),
      ]);
      setProviders(overview.providers);
      setModels(overview.models);
      setFallbackRules(overview.fallbackRules);
      setCircuits(overview.health.circuits);
      setUsage(overview.usage);
      setSupabaseStats(overview.supabaseStats ?? null);
      setDocsGeneratedAt(overview.docs.generatedAt);
      setLogs(logResp.logs);
      setHealthMatrix(matrixResp.matrix);
      setDiscoveredProviders(matrixResp.discoveredProviders);
      setOpenSourceEvaluations(matrixResp.openSourceEvaluations);
      setRouterSummary(matrixResp.router);
      if (!newModelProviderId && overview.providers[0]) {
        setNewModelProviderId(overview.providers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API Gateway admin data.');
    } finally {
      setLoading(false);
    }
  }, [user, providerFilter, errorsOnly, logSearch, newModelProviderId]);

  useEffect(() => {
    if (authReady && user) {
      void loadData();
    }
  }, [authReady, user, loadData]);

  const handleTestProvider = async (id: string) => {
    if (!user) return;
    setTestingId(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await novaApi.adminGateway.testProvider(token, id);
      setTestResults((prev) => ({ ...prev, [id]: res.result }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connectivity test failed.');
    } finally {
      setTestingId(null);
    }
  };

  const handleRunFullSuite = async () => {
    if (!user || runningFullSuite) return;
    setRunningFullSuite(true);
    setError(null);
    setSuiteMessage(null);
    try {
      const token = await user.getIdToken();
      const report = await novaApi.adminGateway.testAllEndpoints(token);
      setSuiteMessage(
        `Diagnostic suite finished at ${new Date(report.testedAt).toLocaleTimeString()}: ${report.summary.Working} Working · ${report.summary.Degraded} Degraded · ${report.summary['Authentication required']} Auth Required · ${report.summary['Rate limited']} Rate Limited · ${report.summary.Unavailable} Unavailable`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Full diagnostic suite failed.');
    } finally {
      setRunningFullSuite(false);
    }
  };

  const handleTestProviderEndpoints = async (providerId: string) => {
    if (!user || testingProviderEpsId) return;
    setTestingProviderEpsId(providerId);
    setError(null);
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.testProviderEndpoints(token, providerId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Endpoint diagnostic failed.');
    } finally {
      setTestingProviderEpsId(null);
    }
  };

  const handleToggleProvider = async (prov: GatewayProviderItem) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.updateProvider(token, prov.id, { enabled: !prov.enabled });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider.');
    }
  };

  const startEditProvider = (prov: GatewayProviderItem) => {
    setEditingProviderId(prov.id);
    setEditProvName(prov.name);
    setEditProvUrl(prov.baseUrl);
    setEditProvApiStyle(prov.apiStyle);
    setEditProvAuthType(prov.authType);
    setEditProvCaps([...prov.capabilities]);
  };

  const handleSaveProviderEdit = async (e: React.FormEvent, prov: GatewayProviderItem) => {
    e.preventDefault();
    if (!user || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.updateProvider(token, prov.id, {
        name: editProvName.trim() || prov.name,
        baseUrl: editProvUrl.trim() || prov.baseUrl,
        apiStyle: editProvApiStyle.trim() || prov.apiStyle,
        authType: editProvAuthType,
        capabilities: editProvCaps.length > 0 ? editProvCaps : prov.capabilities,
      });
      setEditingProviderId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider settings.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.createProvider(token, {
        name: newProvName,
        slug: newProvSlug,
        baseUrl: newProvUrl,
        capabilities: [newProvCap],
        enabled: true,
      });
      setNewProvName('');
      setNewProvSlug('');
      setNewProvUrl('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register provider.');
    }
  };

  const handleToggleModel = async (m: GatewayModelItem) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.updateModel(token, m.id, { active: !m.active });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle model.');
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.createModel(token, {
        id: newModelId,
        name: newModelName,
        providerId: newModelProviderId,
        modelIdentifier: newModelIdentifier,
        capabilities: [newModelCap],
        supportedLanguages: ['en', 'ar'],
        inputTypes: ['text'],
        outputTypes: newModelCap === 'text-to-image' || newModelCap === 'image_generation' ? ['image'] : ['text'],
        active: true,
        verified: false,
      });
      setNewModelId('');
      setNewModelName('');
      setNewModelIdentifier('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register model.');
    }
  };

  const handleCreateFallback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.createFallback(token, {
        capability: fbCap,
        primaryProviderSlug: fbPrimarySlug,
        fallbackProviderSlug: fbFallbackSlug,
        fallbackModelId: fbFallbackModelId,
        requireCompatibleIo: true,
        priority: 1,
        enabled: true,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid fallback rule.');
    }
  };

  const handleDeleteFallback = async (id: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await novaApi.adminGateway.deleteFallback(token, id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete fallback rule.');
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
            Administrator Sign-In Required
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Access to the NOVA API Gateway Registry, provider keys/configuration, logs, and fallback controls requires an authorized Firebase Admin account.
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

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'providers', label: 'Providers & Tester', icon: Server },
    { id: 'models', label: 'Models & Capabilities', icon: Cpu },
    { id: 'health', label: 'API Health Matrix', icon: Activity },
    { id: 'discovery', label: 'Free Discovery & OSS', icon: Compass },
    { id: 'logs', label: 'Request & Error Logs', icon: ScrollText },
    { id: 'fallbacks', label: 'Fallback Rules', icon: GitFork },
    { id: 'docs', label: 'API Docs', icon: BookText },
  ];

  const statusTextClass = (status: DetailedAvailabilityStatus) => {
    switch (status) {
      case 'Working':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'Degraded':
      case 'Rate limited':
        return 'text-amber-600 dark:text-amber-400';
      case 'Authentication required':
        return 'text-blue-600 dark:text-blue-400';
      case 'Not tested':
        return 'text-slate-500 dark:text-slate-400';
      case 'Unavailable':
      default:
        return 'text-red-600 dark:text-red-400';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-mono text-slate-500">
            NOVA Backend · Centralized API Gateway Control Plane · {user.email}
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
            API Management Dashboard
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
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

      {/* PROVIDERS & TESTER */}
      {tab === 'providers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {providers.map((p) => {
              const test = testResults[p.id];
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        {p.name}
                      </h2>
                      <p className="text-xs font-mono text-slate-500 truncate">
                        {p.slug} · {p.baseUrl}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded ${
                        p.healthStatus === 'healthy'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : p.healthStatus === 'unavailable'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {p.healthStatus}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">API Style</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">{p.apiStyle}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Auth Mode</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">{p.authType}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">Capabilities</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">
                        {p.capabilities.join(' · ')}
                      </dd>
                    </div>
                  </dl>

                  {p.lastError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 break-words">
                      Last upstream error: {p.lastError}
                    </p>
                  )}

                  {test && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className={test.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                          {test.connected ? 'CONNECTED' : 'FAILED'} · HTTP {test.httpStatus}
                        </span>
                        <span className="tabular-nums text-slate-500">{test.durationMs} ms</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{test.validationResult}</p>
                      {test.sample && (
                        <p className="font-mono text-[11px] text-slate-500 truncate">Sample: {test.sample}</p>
                      )}
                      {test.error && <p className="text-red-600 dark:text-red-400">{test.error}</p>}
                    </div>
                  )}

                  {editingProviderId === p.id && (
                    <form
                      onSubmit={(e) => void handleSaveProviderEdit(e, p)}
                      className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-3 text-xs"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={editProvName}
                          onChange={(e) => setEditProvName(e.target.value)}
                          placeholder="Provider Name"
                          required
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10]"
                        />
                        <input
                          type="text"
                          value={editProvUrl}
                          onChange={(e) => setEditProvUrl(e.target.value)}
                          disabled={p.baseUrl.startsWith('internal://')}
                          placeholder="https://api.example.com"
                          required
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] font-mono disabled:opacity-60"
                        />
                        <input
                          type="text"
                          value={editProvApiStyle}
                          onChange={(e) => setEditProvApiStyle(e.target.value)}
                          placeholder="API Style"
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] font-mono"
                        />
                        <select
                          value={editProvAuthType}
                          onChange={(e) => setEditProvAuthType(e.target.value as GatewayProviderItem['authType'])}
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10]"
                        >
                          <option value="none">none</option>
                          <option value="env_api_key">env_api_key</option>
                          <option value="bearer">bearer</option>
                          <option value="oauth2">oauth2</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_CAPABILITIES.map((cap) => {
                          const selected = editProvCaps.includes(cap);
                          return (
                            <button
                              key={cap}
                              type="button"
                              onClick={() =>
                                setEditProvCaps((prev) =>
                                  selected ? prev.filter((c) => c !== cap) : [...prev, cap]
                                )
                              }
                              className={`px-2 py-1 rounded border text-[11px] font-mono ${
                                selected
                                  ? 'border-blue-500 bg-blue-600/15 text-blue-600 dark:text-blue-400'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {cap}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProviderId(null)}
                          className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="px-3 py-1.5 rounded bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingEdit ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleToggleProvider(p)}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {p.enabled ? 'Disable Provider' : 'Enable Provider'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          editingProviderId === p.id ? setEditingProviderId(null) : startEditProvider(p)
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{editingProviderId === p.id ? 'Close Edit' : 'Edit'}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTestProvider(p.id)}
                      disabled={testingId === p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" />
                      {testingId === p.id ? 'Testing...' : 'Test Connectivity'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleCreateProvider}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-500" />
              Register Custom Provider
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                value={newProvName}
                onChange={(e) => setNewProvName(e.target.value)}
                placeholder="Provider Name"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
              />
              <input
                type="text"
                value={newProvSlug}
                onChange={(e) => setNewProvSlug(e.target.value)}
                placeholder="provider_slug"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <input
                type="url"
                value={newProvUrl}
                onChange={(e) => setNewProvUrl(e.target.value)}
                placeholder="https://api.example.com"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <div className="flex gap-2">
                <select
                  value={newProvCap}
                  onChange={(e) => setNewProvCap(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
                >
                  {ALL_CAPABILITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODELS */}
      {tab === 'models' && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-semibold">Model</th>
                  <th className="py-3 px-4 font-semibold">Provider</th>
                  <th className="py-3 px-4 font-semibold">Capabilities</th>
                  <th className="py-3 px-4 font-semibold">I/O &amp; Stream</th>
                  <th className="py-3 px-4 font-semibold">Languages</th>
                  <th className="py-3 px-4 font-semibold">Verified</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {models.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{m.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{m.id}</p>
                    </td>
                    <td className="py-3 px-4 font-mono">{m.providerSlug}</td>
                    <td className="py-3 px-4 font-mono">{m.capabilities.join(', ')}</td>
                    <td className="py-3 px-4 font-mono">
                      {m.inputTypes.join('/')} → {m.outputTypes.join('/')} · {m.streamingSupport ? 'SSE' : 'JSON'}
                    </td>
                    <td className="py-3 px-4 font-mono">{m.supportedLanguages.join(', ')}</td>
                    <td className="py-3 px-4">
                      {m.verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Unverified</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleToggleModel(m)}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {m.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleCreateModel}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Assign New Model to Provider
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                placeholder="Model Registry ID"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="Display Name"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
              />
              <select
                value={newModelProviderId}
                onChange={(e) => setNewModelProviderId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newModelIdentifier}
                onChange={(e) => setNewModelIdentifier(e.target.value)}
                placeholder="Upstream model id"
                required
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <div className="flex gap-2">
                <select
                  value={newModelCap}
                  onChange={(e) => setNewModelCap(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
                >
                  {ALL_CAPABILITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Assign
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* API HEALTH MATRIX & USAGE */}
      {tab === 'health' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Automated API Health Diagnostic Matrix
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Runs live DNS lookup, harmless test payloads, content validation, and rate-limit detection across all registered providers.
              </p>
              {suiteMessage && (
                <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 pt-1">{suiteMessage}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleRunFullSuite()}
              disabled={runningFullSuite}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {runningFullSuite ? 'Running Real Endpoint Probes...' : 'Run Full API Test Suite'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {(
              [
                'Working',
                'Degraded',
                'Rate limited',
                'Authentication required',
                'Not tested',
                'Unavailable',
              ] as DetailedAvailabilityStatus[]
            ).map((statusName) => {
              const count = healthMatrix.filter((r) => r.connectionStatus === statusName).length;
              return (
                <div
                  key={statusName}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-3.5"
                >
                  <p className="text-[11px] text-slate-500 truncate">{statusName}</p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${statusTextClass(statusName)}`}>{count}</p>
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-3 font-semibold">Provider</th>
                  <th className="py-3 px-3 font-semibold">Endpoint</th>
                  <th className="py-3 px-3 font-semibold">Model</th>
                  <th className="py-3 px-3 font-semibold">Capability</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-3 font-semibold">Last Test</th>
                  <th className="py-3 px-3 font-semibold">Latency</th>
                  <th className="py-3 px-3 font-semibold">Success / Error</th>
                  <th className="py-3 px-3 font-semibold">Free-Tier Limits</th>
                  <th className="py-3 px-3 font-semibold">Availability</th>
                  <th className="py-3 px-3 font-semibold text-right">Probe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {healthMatrix.map((row) => (
                  <tr key={`${row.providerId}-${row.endpointId}`} className="align-top">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {row.providerName}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] max-w-[200px] break-all text-slate-600 dark:text-slate-300">
                      {row.apiEndpoint}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">{row.modelName}</td>
                    <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">{row.capability}</td>
                    <td className={`py-3 px-3 font-semibold whitespace-nowrap ${statusTextClass(row.connectionStatus)}`}>
                      {row.connectionStatus}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] tabular-nums whitespace-nowrap text-slate-500">
                      {row.lastTestTime ? new Date(row.lastTestTime).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] tabular-nums whitespace-nowrap">
                      {row.responseTimeMs !== null ? `${row.responseTimeMs} ms` : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] tabular-nums whitespace-nowrap">
                      {row.successRatePct}% / {row.errorRatePct}%
                    </td>
                    <td className="py-3 px-3 text-[11px] max-w-[220px] text-slate-600 dark:text-slate-300">
                      {row.freeTierLimits}
                    </td>
                    <td className="py-3 px-3 text-[11px] max-w-[180px] text-slate-700 dark:text-slate-200">
                      <p>{row.currentAvailability}</p>
                      {row.lastError && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 break-words">
                          {row.lastError}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleTestProviderEndpoints(row.providerId)}
                        disabled={testingProviderEpsId === row.providerId}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        {testingProviderEpsId === row.providerId ? '...' : 'Test'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
              <p className="text-xs text-slate-500">Total Gateway Requests</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                {usage?.totalRequests ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
              <p className="text-xs text-slate-500">Successful Calls</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                {usage?.successfulRequests ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
              <p className="text-xs text-slate-500">Failed Calls</p>
              <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-1">
                {usage?.failedRequests ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-4">
              <p className="text-xs text-slate-500">Average Latency</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                {usage?.avgDurationMs ?? 0} ms
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Circuit Breakers
              </h2>
              {circuits.length === 0 ? (
                <p className="text-xs text-slate-500">All provider circuits nominal (no trips recorded yet).</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {circuits.map((c) => (
                    <div key={c.providerSlug} className="py-2 flex items-center justify-between font-mono">
                      <span>{c.providerSlug}</span>
                      <span>
                        state={c.state} · failures={c.failures}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Usage by Provider
              </h2>
              {!usage || Object.keys(usage.byProvider).length === 0 ? (
                <p className="text-xs text-slate-500">No gateway calls recorded in the current session yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
                  {Object.entries(usage.byProvider).map(([slug, stats]) => (
                    <div key={slug} className="py-2 flex items-center justify-between tabular-nums">
                      <span>{slug}</span>
                      <span>
                        {stats.total} req · {stats.failed} err · {stats.avgDurationMs} ms
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Supabase Persistence Stats */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                Supabase Database Persistence
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {supabaseStats?.configured ? 'Connected (jlexjqlehjtjzjoqgcwo)' : 'Service-role key not configured in Secrets'}
              </span>
            </div>
            {supabaseStats?.configured ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  { label: 'nova_jobs', val: supabaseStats.jobsCount },
                  { label: 'nova_assets', val: supabaseStats.assetsCount },
                  { label: 'nova_api_logs', val: supabaseStats.logsCount },
                  { label: 'nova_api_endpoint_tests', val: supabaseStats.endpointTestsCount },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <p className="font-mono text-slate-500">{stat.label}</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {stat.val !== null ? stat.val : '—'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in server secrets to persist gateway logs, jobs, endpoint probes, and private image assets.
              </p>
            )}
          </div>
        </div>
      )}

      {/* FREE PROVIDER DISCOVERY & OPEN-SOURCE EVALUATION */}
      {tab === 'discovery' && (
        <div className="space-y-6">
          {routerSummary && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Centralized Free AI Capability Router
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Routes requests strictly to verified enabled free-tier models with compatible inputs/outputs. Never silently falls back to paid APIs.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {[
                  { title: 'Free Text / Chat (AR+EN)', items: routerSummary.freeTextCandidates },
                  { title: 'Free Text-to-Image', items: routerSummary.freeImageCandidates },
                  { title: 'Free Multimodal Vision', items: routerSummary.freeMultimodalCandidates },
                  { title: 'Free Search', items: routerSummary.freeSearchCandidates },
                ].map((group) => (
                  <div
                    key={group.title}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2"
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{group.title}</p>
                    {group.items.length === 0 ? (
                      <p className="text-slate-500">No active candidates available.</p>
                    ) : (
                      <ol className="space-y-1.5 font-mono text-[11px]">
                        {group.items.map((c, idx) => (
                          <li key={c.modelId} className="text-slate-700 dark:text-slate-300">
                            <span className="text-blue-600 dark:text-blue-400">{idx + 1}.</span> {c.modelId}{' '}
                            <span className="text-slate-500">(score {c.score})</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Discovered Free AI Providers (Official Documentation Audit)
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-3 font-semibold">Provider</th>
                    <th className="py-3 px-3 font-semibold">Tier Classification</th>
                    <th className="py-3 px-3 font-semibold">Official Endpoint &amp; Models</th>
                    <th className="py-3 px-3 font-semibold">Auth</th>
                    <th className="py-3 px-3 font-semibold">Free-Tier &amp; Rate Limits</th>
                    <th className="py-3 px-3 font-semibold">Commercial Terms</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {discoveredProviders.map((dp) => (
                    <tr key={dp.slug} className="align-top">
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {dp.providerName}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap text-blue-600 dark:text-blue-400">
                        {dp.tierClassification}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] max-w-[240px]">
                        <p className="break-all text-slate-700 dark:text-slate-300">{dp.officialEndpoint}</p>
                        <p className="text-slate-500 mt-1">{dp.supportedModels.join(', ')}</p>
                      </td>
                      <td className="py-3 px-3 text-[11px] max-w-[160px]">{dp.authRequirement}</td>
                      <td className="py-3 px-3 text-[11px] max-w-[220px]">
                        <p>{dp.freeTierLimits}</p>
                        <p className="text-slate-500 mt-0.5">
                          {dp.rateLimits} · Context: {dp.contextLimits} ·{' '}
                          {dp.imageGenerationAvailable ? 'Image Gen Yes' : 'No Image Gen'} ·{' '}
                          {dp.streamingSupport ? 'SSE' : 'REST'}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-[11px] max-w-[190px] text-slate-600 dark:text-slate-400">
                        {dp.commercialUseRestrictions}
                      </td>
                      <td className="py-3 px-3 text-[11px] max-w-[190px] font-medium">
                        {dp.currentAvailability}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Open-Source Model Alternatives &amp; Hosting Feasibility
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-3 font-semibold">Open-Weight Model</th>
                    <th className="py-3 px-3 font-semibold">Params / License</th>
                    <th className="py-3 px-3 font-semibold">Arabic</th>
                    <th className="py-3 px-3 font-semibold">Min Hardware</th>
                    <th className="py-3 px-3 font-semibold">Local Node Host</th>
                    <th className="py-3 px-3 font-semibold">Hosting Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {openSourceEvaluations.map((oss) => (
                    <tr key={oss.modelName} className="align-top">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{oss.modelName}</p>
                        <p className="text-[11px] text-slate-500">{oss.capabilities.join(' · ')}</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {oss.parameters} · {oss.license}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">{oss.arabicSupport}</td>
                      <td className="py-3 px-3 text-[11px]">{oss.minHardwareEstimate}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                        {oss.canRunOnCurrentNodeHost ? 'Supported' : 'Remote Free API Required'}
                      </td>
                      <td className="py-3 px-3 text-[11px] max-w-[300px] text-slate-600 dark:text-slate-300">
                        {oss.hostingReality}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LOGS */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter by request ID, model, endpoint, or error..."
                className="w-full ps-9 pe-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              />
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              <span>Error Logs Only</span>
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Provider / Model</th>
                  <th className="py-3 px-4">Endpoint</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Details (Redacted)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 px-4 text-center text-slate-500 font-sans">
                      No matching API Gateway logs yet. Run a connectivity test or execute a tool request.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 tabular-nums whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4">{l.requestId}</td>
                      <td className="py-2.5 px-4">
                        {l.providerSlug} · {l.modelId}
                      </td>
                      <td className="py-2.5 px-4 max-w-xs truncate">{l.endpoint}</td>
                      <td className="py-2.5 px-4 tabular-nums">
                        <span className={l.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                          {l.statusCode} {l.errorClass || 'OK'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 tabular-nums">{l.durationMs} ms</td>
                      <td className="py-2.5 px-4 max-w-sm truncate text-slate-500">
                        {l.errorMessage || JSON.stringify(l.redactedMeta)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FALLBACK RULES */}
      {tab === 'fallbacks' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Fallback rules enforce strict capability &amp; I/O compatibility checks: NOVA will reject any rule attempting to replace an image-generation model with a text-only model.
            </p>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {fallbackRules.map((r) => (
                <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono space-y-0.5">
                    <p className="text-slate-900 dark:text-white font-semibold">
                      [{r.capability}] {r.primaryProviderSlug} → {r.fallbackProviderSlug} ({r.fallbackModelId})
                    </p>
                    <p className="text-slate-500">
                      Priority {r.priority} · Compatible I/O Enforced: {r.requireCompatibleIo ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteFallback(r.id)}
                    className="px-2.5 py-1 rounded border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCreateFallback}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3"
          >
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Add Compatible Fallback Rule
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={fbCap}
                onChange={(e) => setFbCap(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090B10] text-xs"
              >
                {ALL_CAPABILITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={fbPrimarySlug}
                onChange={(e) => setFbPrimarySlug(e.target.value)}
                placeholder="Primary provider slug"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <input
                type="text"
                value={fbFallbackSlug}
                onChange={(e) => setFbFallbackSlug(e.target.value)}
                placeholder="Fallback provider slug"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fbFallbackModelId}
                  onChange={(e) => setFbFallbackModelId(e.target.value)}
                  placeholder="Fallback model ID"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* AUTO-MAINTAINED API DOCS */}
      {tab === 'docs' && (
        <div className="space-y-4">
          <p className="text-xs font-mono text-slate-500">
            Auto-generated from live Gateway registry · Last synced:{' '}
            {docsGeneratedAt ? new Date(docsGeneratedAt).toLocaleString() : '—'}
          </p>
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017] p-5 space-y-3"
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {p.name} ({p.slug}) · {p.baseUrl}
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {p.endpoints.map((ep) => (
                  <div key={ep.id} className="py-3 space-y-1">
                    <div className="flex flex-wrap justify-between gap-2 font-mono">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {ep.method} {ep.path}
                      </span>
                      <span className="text-slate-500">{ep.contentType}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{ep.exampleRequest}</p>
                    {ep.verifiedResponseSchema && (
                      <p className="font-mono text-[11px] text-slate-500">Schema: {ep.verifiedResponseSchema}</p>
                    )}
                    {ep.knownLimitations && (
                      <p className="text-amber-600 dark:text-amber-400">{ep.knownLimitations}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
