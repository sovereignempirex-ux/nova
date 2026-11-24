import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Database,
  Download,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
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
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { ImageProviderInfo, SupabaseStatusInfo, novaApi } from '../lib/apiClient';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  createCompactThumbnail,
  getImageFromLocalCache,
  saveImageToLocalCache,
} from '../lib/imageDb';
import { usePageMeta } from '../hooks/usePageMeta';
import studioPlaceholder from '../assets/images/nova_image_studio_preview_1795512843208.jpg';

interface ImageJobRecord {
  id: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  imageDataUrl?: string;
  externalUrl?: string;
  supabasePath?: string;
  supabaseSignedUrl?: string;
  thumbnailDataUrl?: string;
  errorMessage?: string;
  createdAtIso: string;
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const PROMPT_PRESETS = [
  'Minimalist architectural glass studio bathed in warm golden-hour sunlight, 35mm photography',
  'Isometric cybernetic observatory dome surrounded by cherry blossoms at twilight, crisp detail',
  'Macro editorial shot of cobalt crystal refracting soft studio light on dark slate',
];

export const ImageStudioPage: React.FC = () => {
  usePageMeta(
    'Image Studio — NOVA',
    'Generate images with Free AI Custom, Nezuko Flux/Monte AI, and Gemini providers with asynchronous job tracking and Supabase private storage.',
    '/image-studio'
  );

  const { user, authReady } = useAuth();
  const { t } = useLanguage();
  const [providers, setProviders] = useState<ImageProviderInfo[]>([
    {
      id: 'auto:free-image',
      providerSlug: 'nova_router',
      label: 'Auto Free Image Router (Best Verified Free Generator)',
      description: 'Automatically selects verified working free image providers with cooldown & error fallback.',
      tier: 'free',
      supportsAspect: true,
      verified: true,
    },
    {
      id: 'free_ai_custom:qwen7b',
      providerSlug: 'free_ai_custom',
      label: 'Free AI Custom · Qwen 7B (SDXL)',
      description: 'SSE chat text-to-image synthesis via api.free.ai (Free & Active).',
      tier: 'free',
      supportsAspect: false,
      verified: true,
    },
  ]);

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('auto:free-image');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');

  const [jobs, setJobs] = useState<ImageJobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatusInfo | null>(null);
  const [signingUrl, setSigningUrl] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    novaApi.images
      .getProviders()
      .then((data) => {
        if (data.providers?.length) {
          setProviders(data.providers);
          setModel((prev) =>
            data.providers.some((p) => p.id === prev)
              ? prev
              : data.providers.find((p) => p.id === 'auto:free-image')?.id || data.providers[0].id
          );
        }
      })
      .catch(() => {});

    novaApi.supabase
      .getStatus()
      .then(setSupabaseStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (user) {
      const path = `users/${user.uid}/imageJobs`;
      const q = query(
        collection(db, 'users', user.uid, 'imageJobs'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsub = onSnapshot(
        q,
        async (snap) => {
          const list: ImageJobRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              prompt: String(data.prompt || ''),
              model: String(data.model || ''),
              aspectRatio: String(data.aspectRatio || '1:1'),
              status: data.status as ImageJobRecord['status'],
              thumbnailDataUrl: data.thumbnailDataUrl ? String(data.thumbnailDataUrl) : undefined,
              errorMessage: data.errorMessage ? String(data.errorMessage) : undefined,
              createdAtIso: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
            };
          });
          setJobs(list);
          setLoadingJobs(false);
          if (list.length > 0 && !selectedJobId) {
            setSelectedJobId(list[0].id);
          }

          const hydrated: Record<string, string> = {};
          await Promise.all(
            list.map(async (j) => {
              const cached = await getImageFromLocalCache(j.id);
              if (cached) hydrated[j.id] = cached;
            })
          );
          if (mountedRef.current && Object.keys(hydrated).length > 0) {
            setLocalImages((prev) => ({ ...prev, ...hydrated }));
          }
        },
        (err) => {
          setLoadingJobs(false);
          handleFirestoreError(err, OperationType.LIST, path);
        }
      );

      return () => unsub();
    }

    novaApi.images
      .listJobs()
      .then((data) => {
        if (!mountedRef.current) return;
        if (data.jobs) {
          const mapped: ImageJobRecord[] = data.jobs.map((j) => ({
            id: j.id,
            prompt: j.prompt,
            model: j.model,
            aspectRatio: j.aspectRatio,
            status: j.status,
            imageDataUrl: j.imageDataUrl,
            externalUrl: j.externalUrl,
            supabasePath: j.supabasePath,
            supabaseSignedUrl: j.supabaseSignedUrl,
            errorMessage: j.errorMessage,
            createdAtIso: j.createdAt,
          }));
          setJobs(mapped);
          if (mapped.length > 0 && !selectedJobId) {
            setSelectedJobId(mapped[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoadingJobs(false);
      });
  }, [authReady, user, selectedJobId]);

  const pollJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (!mountedRef.current) break;
      await new Promise((r) => setTimeout(r, 1200));
      if (!mountedRef.current) break;
      let serverJob;
      try {
        const res = await novaApi.images.getJob(jobId);
        serverJob = res.job;
      } catch {
        break;
      }
      if (!mountedRef.current) break;

      if (serverJob.status === 'processing' && user && user.emailVerified) {
        const path = `users/${user.uid}/imageJobs/${jobId}`;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'imageJobs', jobId), {
            status: 'processing',
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }

      if (serverJob.status === 'completed' || serverJob.status === 'failed') {
        if (serverJob.imageDataUrl) {
          await saveImageToLocalCache(jobId, serverJob.imageDataUrl);
          setLocalImages((prev) => ({ ...prev, [jobId]: serverJob.imageDataUrl! }));
        }

        if (user && user.emailVerified) {
          const path = `users/${user.uid}/imageJobs/${jobId}`;
          try {
            if (serverJob.status === 'completed' && serverJob.imageDataUrl) {
              const thumb = await createCompactThumbnail(serverJob.imageDataUrl);
              const payload: Record<string, unknown> = {
                status: 'completed',
                updatedAt: serverTimestamp(),
              };
              if (thumb) payload.thumbnailDataUrl = thumb;
              await updateDoc(doc(db, 'users', user.uid, 'imageJobs', jobId), payload);
            } else {
              await updateDoc(doc(db, 'users', user.uid, 'imageJobs', jobId), {
                status: 'failed',
                errorMessage: (serverJob.errorMessage || 'Generation failed.').slice(0, 500),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, path);
          }
        }

        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: serverJob.status,
                  imageDataUrl: serverJob.imageDataUrl,
                  externalUrl: serverJob.externalUrl,
                  supabasePath: serverJob.supabasePath,
                  supabaseSignedUrl: serverJob.supabaseSignedUrl,
                  errorMessage: serverJob.errorMessage,
                }
              : j
          )
        );
        break;
      }
    }
  };

  const queueJob = async (params: {
    prompt: string;
    model: string;
    aspectRatio: string;
    imageSize: string;
  }) => {
    if (!params.prompt.trim() || submitting) return;

    setFormError(null);
    setSubmitting(true);

    try {
      const { job: created } = await novaApi.images.generate({
        prompt: params.prompt.trim(),
        model: params.model,
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize,
      });

      if (user && user.emailVerified) {
        const path = `users/${user.uid}/imageJobs/${created.id}`;
        try {
          await setDoc(doc(db, 'users', user.uid, 'imageJobs', created.id), {
            userId: user.uid,
            prompt: created.prompt,
            model: created.model.slice(0, 64),
            aspectRatio: created.aspectRatio,
            status: 'queued',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else {
        setJobs((prev) => [
          {
            id: created.id,
            prompt: created.prompt,
            model: created.model,
            aspectRatio: created.aspectRatio,
            status: created.status,
            createdAtIso: created.createdAt,
          },
          ...prev,
        ]);
      }

      setSelectedJobId(created.id);
      void pollJob(created.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to start image job.');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void queueJob({ prompt, model, aspectRatio, imageSize });
  };

  const handleRefreshSignedUrl = async (job: ImageJobRecord) => {
    if (!job.supabasePath || signingUrl) return;
    setSigningUrl(true);
    try {
      const { signedUrl } = await novaApi.supabase.getSignedUrl(job.supabasePath);
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, supabaseSignedUrl: signedUrl } : j))
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to sign private Supabase URL.');
    } finally {
      setSigningUrl(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (user) {
      const path = `users/${user.uid}/imageJobs/${jobId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'imageJobs', jobId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
    if (selectedJobId === jobId) {
      setSelectedJobId(null);
    }
  };

  const selectedProvider = providers.find((p) => p.id === model);
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null;
  const activeImageUrl = selectedJob
    ? selectedJob.supabaseSignedUrl ||
      localImages[selectedJob.id] ||
      selectedJob.imageDataUrl ||
      selectedJob.thumbnailDataUrl
    : undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <header className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          {t('imageStudio')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
          Queue asynchronous image generation jobs across Free AI Custom Qwen 7B, Nezuko Flux / Monte AI, and Gemini image models with private Supabase storage integration.
        </p>
      </header>

      {/* Supabase Storage Connection Overview */}
      {supabaseStatus && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
            <Database className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-slate-900 dark:text-white">Supabase Storage</span>
            <span aria-hidden="true">·</span>
            <span>Bucket: {supabaseStatus.bucket} ({supabaseStatus.bucketAccess})</span>
            <span aria-hidden="true">·</span>
            <span>Max 25 MB · PNG, JPEG, WebP</span>
          </div>
          <span
            className={
              supabaseStatus.bucketReady
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : 'text-amber-600 dark:text-amber-400 font-medium'
            }
          >
            {supabaseStatus.message}
          </span>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Generation Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5"
        >
          <div className="space-y-2">
            <label htmlFor="img-prompt" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Visual Prompt
            </label>
            <textarea
              id="img-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe subject, lighting, lens, materials, and framing..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(preset)}
                  className="text-start text-[11px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-500/60 hover:text-slate-900 dark:hover:text-slate-100 transition-colors line-clamp-1 max-w-full"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="img-provider" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              AI Provider Model
            </label>
            <select
              id="img-provider"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.tier === 'paid' ? 'Requires Paid Key' : 'Free'})
                </option>
              ))}
            </select>
            {selectedProvider && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {selectedProvider.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Aspect Ratio
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors tabular-nums ${
                    aspectRatio === ratio
                      ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {model === 'gemini-nano-banana-2.1' && (
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Output Resolution
              </span>
              <div className="grid grid-cols-3 gap-2">
                {['1K', '2K', '4K'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setImageSize(sz)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      imageSize === sz
                        ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{formError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!prompt.trim() || submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{submitting ? t('queuingJob') : t('generateImage')}</span>
          </button>
        </form>

        {/* Active Viewport & Job Queue */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
            {selectedJob ? (
              <div>
                <div className="aspect-[16/10] bg-slate-950 flex items-center justify-center relative overflow-hidden">
                  {selectedJob.status === 'queued' || selectedJob.status === 'processing' ? (
                    <div className="text-center space-y-3 p-6">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                      <p className="text-sm font-medium text-slate-200">
                        Job {selectedJob.status} — waiting for provider response
                      </p>
                    </div>
                  ) : selectedJob.status === 'failed' ? (
                    <div className="text-center max-w-md space-y-3 p-6">
                      <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
                      <p className="text-sm font-semibold text-red-400">Generation Failed</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {selectedJob.errorMessage || 'Upstream provider could not complete this request.'}
                      </p>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() =>
                          void queueJob({
                            prompt: selectedJob.prompt,
                            model: selectedJob.model || model,
                            aspectRatio: selectedJob.aspectRatio || aspectRatio,
                            imageSize,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('retry')}</span>
                      </button>
                    </div>
                  ) : activeImageUrl ? (
                    <img
                      src={activeImageUrl}
                      alt={selectedJob.prompt}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center space-y-2 p-6">
                      <ImageIcon className="w-8 h-8 text-slate-500 mx-auto" />
                      <p className="text-xs text-slate-400">
                        Full-resolution asset is stored in the generating browser session.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {selectedJob.prompt}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {selectedJob.model} · {selectedJob.aspectRatio} · Status: {selectedJob.status}
                      {selectedJob.supabasePath ? ` · Bucket: ${selectedJob.supabasePath}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(selectedJob.supabaseSignedUrl || selectedJob.externalUrl) && (
                      <Link
                        to={`/image-enhancer?url=${encodeURIComponent(
                          selectedJob.supabaseSignedUrl || selectedJob.externalUrl || ''
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('loadIntoEnhancer')}</span>
                      </Link>
                    )}

                    {selectedJob.supabasePath && (
                      <button
                        type="button"
                        onClick={() => void handleRefreshSignedUrl(selectedJob)}
                        disabled={signingUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{signingUrl ? 'Signing...' : 'New Signed URL'}</span>
                      </button>
                    )}

                    {activeImageUrl && (
                      <a
                        href={activeImageUrl}
                        download={`nova-${selectedJob.id}.png`}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="aspect-[16/10] bg-slate-950 relative overflow-hidden">
                  <img
                    src={studioPlaceholder}
                    alt="NOVA Image Studio preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-80"
                  />
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    No generation jobs yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enter a prompt on the left to queue an asynchronous image generation job.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Job History List */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('jobHistory')}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {jobs.length} total
              </span>
            </div>

            {loadingJobs ? (
              <div className="p-4 space-y-2.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Completed and failed generation jobs will appear here with full error diagnostics.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`pe-3 flex items-center justify-between gap-2 transition-colors ${
                      selectedJob?.id === job.id
                        ? 'bg-blue-600/5 dark:bg-blue-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className="flex-1 min-w-0 px-4 py-3 text-start space-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {job.prompt}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {job.model} · {job.aspectRatio} ·{' '}
                        <span
                          className={
                            job.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : job.status === 'failed'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {job.status}
                        </span>
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteJob(job.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      aria-label={`Remove job ${job.prompt}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
