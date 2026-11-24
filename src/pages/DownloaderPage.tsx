import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  Play,
  Trash2,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { InspectedMediaMetadata, novaApi } from '../lib/apiClient';
import { useLanguage } from '../lib/LanguageContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { usePageMeta } from '../hooks/usePageMeta';
import { NovaPlayableVideo, NovaVideoPlayer } from '../components/NovaVideoPlayer';
import { resolveVideoSource } from '../../shared/videoSource';

interface FormatRow {
  ext: string;
  mime: string;
  category: string;
  status: string;
}

interface DownloadHistoryItem {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'completed' | 'failed' | 'unsupported';
  createdAtIso: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DownloaderPage: React.FC = () => {
  usePageMeta(
    'Media Downloader — NOVA',
    'Inspect remote media URLs and social links via Nezuko Media Extractor or Direct URL validation before streaming downloads.',
    '/downloader'
  );

  const { user, authReady } = useAuth();
  const { t } = useLanguage();
  const [urlInput, setUrlInput] = useState('');
  const [mode, setMode] = useState<'auto' | 'nezuko' | 'direct'>('auto');
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [receivedBytes, setReceivedBytes] = useState(0);

  const [inspected, setInspected] = useState<InspectedMediaMetadata | null>(null);
  const [variants, setVariants] = useState<InspectedMediaMetadata[]>([]);
  const [inspectSource, setInspectSource] = useState<'nezuko' | 'direct' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [previewVideo, setPreviewVideo] = useState<NovaPlayableVideo | null>(null);

  useEffect(() => {
    novaApi.downloader
      .getFormats()
      .then((data) => {
        if (data.formats) setFormats(data.formats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const path = `users/${user.uid}/downloadJobs`;
    const q = query(
      collection(db, 'users', user.uid, 'downloadJobs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DownloadHistoryItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            url: String(data.url || ''),
            filename: String(data.filename || ''),
            mimeType: String(data.mimeType || ''),
            sizeBytes: Number(data.sizeBytes || 0),
            status: data.status as DownloadHistoryItem['status'],
            createdAtIso: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          };
        });
        setHistory(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user]);

  const recordHistory = async (item: Omit<DownloadHistoryItem, 'id' | 'createdAtIso'>) => {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (user && user.emailVerified) {
      const path = `users/${user.uid}/downloadJobs/${id}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'downloadJobs', id), {
          userId: user.uid,
          url: item.url.slice(0, 2000),
          filename: item.filename.slice(0, 255),
          mimeType: item.mimeType.slice(0, 120),
          sizeBytes: item.sizeBytes,
          status: item.status,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } else {
      setHistory((prev) => [
        { ...item, id, createdAtIso: new Date().toISOString() },
        ...prev.slice(0, 19),
      ]);
    }
  };

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || inspecting) return;

    setInspecting(true);
    setErrorMsg(null);
    setErrorCode(null);
    setSuccessMsg(null);
    setInspected(null);
    setVariants([]);
    setInspectSource(null);
    setPreviewVideo(null);

    try {
      const data = await novaApi.downloader.inspect(urlInput.trim(), mode);
      setInspected(data.metadata);
      setVariants(data.variants ?? [data.metadata]);
      setInspectSource(data.source);
    } catch (err) {
      const eObj = err as Error & { code?: string };
      const detectedCode = eObj.code || null;
      setErrorCode(detectedCode);
      setErrorMsg(eObj.message || 'Inspection failed.');

      if (detectedCode === 'NEZUKO_UPSTREAM_UNAVAILABLE' || detectedCode === 'NO_VALID_MEDIA_RETURNED') {
        void recordHistory({
          url: urlInput.trim(),
          filename: 'Upstream extractor unavailable',
          mimeType: 'platform/nezuko-unavailable',
          sizeBytes: 0,
          status: 'unsupported',
        });
      }
    } finally {
      setInspecting(false);
    }
  };

  const handleDownload = async (target: InspectedMediaMetadata = inspected!) => {
    if (!target || downloading) return;

    setDownloading(true);
    setProgressPct(0);
    setReceivedBytes(0);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const resp = await fetch(`/api/downloader/fetch?url=${encodeURIComponent(target.url)}`);
      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({ error: 'Transfer failed.' }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }

      const total = Number(resp.headers.get('content-length')) || target.sizeBytes || 0;
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          setReceivedBytes(loaded);
          if (total > 0) {
            setProgressPct(Math.min(100, Math.round((loaded / total) * 100)));
          }
        }
      }

      const blobParts = chunks.map((c) => new Uint8Array(c));
      const blob = new Blob(blobParts, { type: target.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = target.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setProgressPct(100);
      setSuccessMsg(`Downloaded ${target.filename} (${formatBytes(loaded)}).`);

      await recordHistory({
        url: target.url,
        filename: target.filename,
        mimeType: target.mimeType,
        sizeBytes: loaded,
        status: 'completed',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
      await recordHistory({
        url: target.url,
        filename: target.filename,
        mimeType: target.mimeType,
        sizeBytes: target.sizeBytes,
        status: 'failed',
      });
    } finally {
      setDownloading(false);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    if (user) {
      const path = `users/${user.uid}/downloadJobs/${id}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'downloadJobs', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setHistory((prev) => prev.filter((h) => h.id !== id));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <header className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          {t('downloaderHeading')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          {t('downloaderSubheading')}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={(e) => void handleInspect(e)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="dl-url" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Media URL
              </label>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1017] border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'nezuko', label: 'Nezuko' },
                    { id: 'direct', label: 'Direct' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      mode === opt.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="dl-url"
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/media/video.mp4"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!urlInput.trim() || inspecting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                {inspecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{inspecting ? t('inspecting') : t('inspectUrl')}</span>
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {errorCode === 'NEZUKO_UPSTREAM_UNAVAILABLE'
                      ? 'Nezuko Extractor Unavailable'
                      : 'Inspection Error'}
                  </p>
                  <p>{errorMsg}</p>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}
          </form>

          {inspected && (() => {
            const inspectedSource = resolveVideoSource(inspected.url, { mimeType: inspected.mimeType });
            const togglePreview = (target: InspectedMediaMetadata) => {
              if (previewVideo?.url === target.url) {
                setPreviewVideo(null);
                return;
              }
              setPreviewVideo({
                id: `dl-preview-${target.url}`,
                title: target.filename,
                url: target.url,
                mimeType: target.mimeType,
                channelName: inspectSource === 'nezuko' ? 'Nezuko Media Extractor' : 'Direct Stream',
                description: `${target.mimeType} · ${formatBytes(target.sizeBytes)}`,
              });
            };

            return (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Validated via {inspectSource === 'nezuko' ? 'Nezuko Media Downloader' : 'Direct HTTP Inspection'}
                    </p>
                    <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white truncate">
                      {inspected.filename}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {inspected.mimeType} · {formatBytes(inspected.sizeBytes)} ·{' '}
                      {inspected.acceptRanges ? 'Resumable stream' : 'Standard stream'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {inspectedSource.embeddable && (
                      <button
                        type="button"
                        onClick={() => togglePreview(inspected)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
                        <span>{previewVideo?.url === inspected.url ? 'Close Player' : 'Play in NOVA'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleDownload(inspected)}
                      disabled={downloading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>{downloading ? 'Downloading...' : t('downloadFile')}</span>
                    </button>
                  </div>
                </div>

                {previewVideo && (
                  <NovaVideoPlayer
                    video={previewVideo}
                    onBack={() => setPreviewVideo(null)}
                    backLabel="Close Preview"
                    autoPlayOnUserSelect={true}
                    compact={true}
                  />
                )}

                {variants.length > 1 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Validated Variants ({variants.length})
                    </p>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                      {variants.map((v, idx) => {
                        const variantPlayable = resolveVideoSource(v.url, { mimeType: v.mimeType }).embeddable;
                        return (
                          <div key={`${v.url}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {v.filename} · {v.mimeType} · {formatBytes(v.sizeBytes)}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              {variantPlayable && (
                                <button
                                  type="button"
                                  onClick={() => togglePreview(v)}
                                  className="text-slate-700 dark:text-slate-200 font-medium hover:text-blue-500 whitespace-nowrap"
                                >
                                  {previewVideo?.url === v.url ? 'Hide' : 'Play'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDownload(v)}
                                disabled={downloading}
                                className="text-blue-600 dark:text-blue-400 font-medium hover:underline whitespace-nowrap"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {downloading && (
                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-150"
                        style={{ width: `${progressPct ?? 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{formatBytes(receivedBytes)} transferred</span>
                      <span>{progressPct !== null ? `${progressPct}%` : 'Streaming'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Transfer History
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {history.length} records
              </span>
            </div>

            {history.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Completed transfers will appear here.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {history.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.filename}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                        {item.mimeType} · {formatBytes(item.sizeBytes)} · {item.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteHistoryItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      aria-label="Remove history entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Supported Formats &amp; Runtime Scope
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {formats.map((row) => (
              <div key={row.ext} className="px-5 py-3.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {row.ext}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      row.status.includes('Unavailable') || row.status.includes('subject to')
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {row.category} · {row.mime}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
