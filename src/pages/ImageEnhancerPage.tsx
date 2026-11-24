import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Download,
  Globe,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  Wand2,
} from 'lucide-react';
import { novaApi } from '../lib/apiClient';
import { useLanguage } from '../lib/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import sampleImage from '../assets/images/nova_image_studio_preview_1795512843208.jpg';

interface EnhancementSettings {
  upscaleFactor: 1 | 2 | 3 | 4;
  sharpness: number;
  contrast: number;
  brightness: number;
  saturation: number;
  denoise: number;
}

const DEFAULT_SETTINGS: EnhancementSettings = {
  upscaleFactor: 2,
  sharpness: 32,
  contrast: 10,
  brightness: 4,
  saturation: 8,
  denoise: 10,
};

const ENHANCEMENT_PRESETS: Array<{ label: string; settings: EnhancementSettings }> = [
  {
    label: 'Portrait Clarity',
    settings: { upscaleFactor: 2, sharpness: 24, contrast: 8, brightness: 6, saturation: 6, denoise: 22 },
  },
  {
    label: 'Crisp Details',
    settings: { upscaleFactor: 3, sharpness: 64, contrast: 16, brightness: 2, saturation: 12, denoise: 8 },
  },
  {
    label: 'Low-Light Lift',
    settings: { upscaleFactor: 2, sharpness: 28, contrast: 14, brightness: 15, saturation: 8, denoise: 28 },
  },
];

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export const ImageEnhancerPage: React.FC = () => {
  usePageMeta(
    'Image Enhancer — NOVA',
    'Upscale resolution up to 4x, sharpen edges, reduce noise, and run Nezuko Image-to-HD or Gemini Auto-Tune.',
    '/image-enhancer'
  );

  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  const [sourceUrl, setSourceUrl] = useState<string>(sampleImage);
  const [remoteUrlInput, setRemoteUrlInput] = useState<string>(() => searchParams.get('url') || '');
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [enhancedUrl, setEnhancedUrl] = useState<string>('');
  const [outputDims, setOutputDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [settings, setSettings] = useState<EnhancementSettings>(DEFAULT_SETTINGS);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/webp' | 'image/jpeg'>('image/png');

  const [processing, setProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [hdLoading, setHdLoading] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const settingsRef = useRef<EnhancementSettings>(settings);
  const pipelineRunIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  settingsRef.current = settings;

  const runEnhancementPipeline = useCallback((img: HTMLImageElement, cfg: EnhancementSettings) => {
    const runId = ++pipelineRunIdRef.current;
    setProcessing(true);
    requestAnimationFrame(() => {
      if (runId !== pipelineRunIdRef.current) return;
      try {
        const maxDim = 3600;
        let targetW = Math.round(img.naturalWidth * cfg.upscaleFactor);
        let targetH = Math.round(img.naturalHeight * cfg.upscaleFactor);
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable.');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const src = new Uint8ClampedArray(imgData.data);
        const dst = imgData.data;

        const contrastFactor = (259 * (cfg.contrast + 255)) / (255 * (259 - cfg.contrast));
        const brightnessOffset = cfg.brightness * 2.1;
        const satFactor = 1 + cfg.saturation / 100;

        for (let i = 0; i < src.length; i += 4) {
          let r = contrastFactor * (src[i] + brightnessOffset - 128) + 128;
          let g = contrastFactor * (src[i + 1] + brightnessOffset - 128) + 128;
          let b = contrastFactor * (src[i + 2] + brightnessOffset - 128) + 128;

          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = luma + (r - luma) * satFactor;
          g = luma + (g - luma) * satFactor;
          b = luma + (b - luma) * satFactor;

          src[i] = clampByte(r);
          src[i + 1] = clampByte(g);
          src[i + 2] = clampByte(b);
        }

        const sharpAmount = cfg.sharpness / 55;
        const denoiseMix = cfg.denoise / 140;

        for (let y = 0; y < targetH; y++) {
          const row = y * targetW;
          const up = Math.max(0, y - 1) * targetW;
          const dn = Math.min(targetH - 1, y + 1) * targetW;

          for (let x = 0; x < targetW; x++) {
            const left = Math.max(0, x - 1);
            const right = Math.min(targetW - 1, x + 1);
            const idx = (row + x) * 4;
            const iU = (up + x) * 4;
            const iD = (dn + x) * 4;
            const iL = (row + left) * 4;
            const iR = (row + right) * 4;

            for (let c = 0; c < 3; c++) {
              const center = src[idx + c];
              const avg4 = (src[iU + c] + src[iD + c] + src[iL + c] + src[iR + c]) * 0.25;
              const denoised = center * (1 - denoiseMix) + avg4 * denoiseMix;
              const sharpened = denoised + (denoised - avg4) * sharpAmount;
              dst[idx + c] = clampByte(sharpened);
            }
            dst[idx + 3] = src[idx + 3];
          }
        }

        if (runId !== pipelineRunIdRef.current) return;
        ctx.putImageData(imgData, 0, 0);
        setOutputDims({ w: targetW, h: targetH });
        setEnhancedUrl(canvas.toDataURL('image/png'));
      } catch (err) {
        if (runId === pipelineRunIdRef.current) {
          setErrorMsg(err instanceof Error ? err.message : 'Enhancement pass failed.');
        }
      } finally {
        if (runId === pipelineRunIdRef.current) {
          setProcessing(false);
        }
      }
    });
  }, []);

  const scheduleEnhancement = useCallback(
    (img: HTMLImageElement, cfg: EnhancementSettings, immediate = false) => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (immediate) {
        runEnhancementPipeline(img, cfg);
        return;
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        runEnhancementPipeline(img, cfg);
      }, 75);
    },
    [runEnhancementPipeline]
  );

  useEffect(() => {
    return () => {
      pipelineRunIdRef.current += 1;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      loadedImgRef.current = img;
      setSourceDims({ w: img.naturalWidth, h: img.naturalHeight });
      runEnhancementPipeline(img, settingsRef.current);
    };
    img.onerror = () => {
      if (!cancelled) setErrorMsg('Unable to decode the selected image.');
    };
    img.src = sourceUrl;
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, runEnhancementPipeline]);

  const updateSetting = <K extends keyof EnhancementSettings>(key: K, value: EnhancementSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (loadedImgRef.current) {
      scheduleEnhancement(loadedImgRef.current, next, key === 'upscaleFactor');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a PNG, JPEG, or WebP image file.');
      return;
    }
    setErrorMsg(null);
    setAiDiagnosis(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleNezukoHd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = remoteUrlInput.trim();
    if (!trimmed || hdLoading) return;

    setHdLoading(true);
    setErrorMsg(null);
    setAiDiagnosis(null);

    try {
      const data = await novaApi.images.enhanceHd(trimmed);
      setSourceUrl(`/api/images/proxy?url=${encodeURIComponent(trimmed)}`);
      setEnhancedUrl(data.imageDataUrl);
      setAiDiagnosis('Upscaled via Nezuko Image-to-HD API.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Nezuko Image-to-HD endpoint is currently unavailable.'
      );
    } finally {
      setHdLoading(false);
    }
  };

  const handleLoadRemoteIntoLocal = () => {
    const trimmed = remoteUrlInput.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    setSourceUrl(`/api/images/proxy?url=${encodeURIComponent(trimmed)}`);
  };

  const handleAiAutoTune = async () => {
    const img = loadedImgRef.current;
    if (!img || analyzing) return;

    setAnalyzing(true);
    setErrorMsg(null);

    try {
      const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.82);
      const base64 = dataUrl.split(',')[1];

      const data = await novaApi.images.analyze(base64, 'image/jpeg');
      const rec = data.recommendation;
      const factor = rec.upscaleFactor === 1 || rec.upscaleFactor === 2 || rec.upscaleFactor === 3 ? rec.upscaleFactor : 2;
      const tuned: EnhancementSettings = {
        upscaleFactor: factor,
        sharpness: Math.min(100, Math.max(0, Math.round(rec.sharpness ?? 35))),
        contrast: Math.min(40, Math.max(-30, Math.round(rec.contrast ?? 12))),
        brightness: Math.min(25, Math.max(-25, Math.round(rec.brightness ?? 4))),
        saturation: Math.min(40, Math.max(-30, Math.round(rec.saturation ?? 10))),
        denoise: Math.min(50, Math.max(0, Math.round(rec.denoise ?? 10))),
      };

      setSettings(tuned);
      if (rec.diagnosticSummary) setAiDiagnosis(rec.diagnosticSummary);
      runEnhancementPipeline(img, tuned);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Auto-Tune failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (!enhancedUrl) return;
    if (exportFormat === 'image/png') {
      const a = document.createElement('a');
      a.href = enhancedUrl;
      a.download = `nova-enhanced-${outputDims.w}x${outputDims.h}.png`;
      a.click();
      return;
    }

    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const ext = exportFormat === 'image/webp' ? 'webp' : 'jpg';
      const a = document.createElement('a');
      a.href = c.toDataURL(exportFormat, 0.92);
      a.download = `nova-enhanced-${outputDims.w}x${outputDims.h}.${ext}`;
      a.click();
    };
    img.src = enhancedUrl;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {t('imageEnhancer')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Upscale resolution up to 4x in-browser, apply unsharp detail recovery, or test remote Nezuko Image-to-HD processing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('uploadImage')}</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="sr-only" />
          </label>

          <button
            type="button"
            onClick={() => void handleAiAutoTune()}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{analyzing ? 'Analyzing...' : t('aiAutoTune')}</span>
          </button>
        </div>
      </header>

      {/* Remote URL / Nezuko Image-to-HD Bar */}
      <form
        onSubmit={(e) => void handleNezukoHd(e)}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3"
      >
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <Globe className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            type="url"
            value={remoteUrlInput}
            onChange={(e) => setRemoteUrlInput(e.target.value)}
            placeholder="Paste remote image URL for Nezuko Image-to-HD or local 4x upscaling..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadRemoteIntoLocal}
            disabled={!remoteUrlInput.trim()}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Load into 4x Enhancer
          </button>
          <button
            type="submit"
            disabled={!remoteUrlInput.trim() || hdLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {hdLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            <span>{hdLoading ? 'Calling Nezuko HD...' : 'Nezuko Image-to-HD'}</span>
          </button>
        </div>
      </form>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{errorMsg}</p>
        </div>
      )}

      {aiDiagnosis && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-blue-600 dark:text-blue-400">Assessment: </span>
          {aiDiagnosis}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Comparison Viewport */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            <span>
              Original: {sourceDims.w} × {sourceDims.h} px
            </span>
            <span>
              Enhanced: {outputDims.w} × {outputDims.h} px ({settings.upscaleFactor}x)
            </span>
          </div>

          <div dir="ltr" className="relative aspect-[4/3] bg-slate-950 select-none overflow-hidden">
            {enhancedUrl ? (
              <>
                <img
                  src={enhancedUrl}
                  alt="Enhanced preview"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                >
                  <img
                    src={sourceUrl}
                    alt="Original preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div
                  className="absolute inset-y-0 w-0.5 bg-white/90 pointer-events-none"
                  style={{ left: `${splitPct}%` }}
                />
                <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 text-[11px] font-medium text-white">
                  Original
                </div>
                <div className="absolute top-3 right-3 px-2 py-1 rounded bg-blue-600/90 text-[11px] font-medium text-white">
                  Enhanced
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                Rendering preview...
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <label htmlFor="split-slider" className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
              Split Compare
            </label>
            <input
              id="split-slider"
              type="range"
              min={0}
              max={100}
              value={splitPct}
              onChange={(e) => setSplitPct(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-xs font-mono tabular-nums text-slate-500 w-10 text-end">
              {splitPct}%
            </span>
          </div>
        </div>

        {/* Enhancement Controls */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Adjustment Controls
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSettings(DEFAULT_SETTINGS);
                if (loadedImgRef.current) runEnhancementPipeline(loadedImgRef.current, DEFAULT_SETTINGS);
              }}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ENHANCEMENT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSettings(preset.settings);
                  if (loadedImgRef.current) {
                    scheduleEnhancement(loadedImgRef.current, preset.settings, true);
                  }
                }}
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-blue-500/60 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Resolution Scale
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {([1, 2, 3, 4] as const).map((factor) => (
                <button
                  key={factor}
                  type="button"
                  onClick={() => updateSetting('upscaleFactor', factor)}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-colors tabular-nums ${
                    settings.upscaleFactor === factor
                      ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {factor}x
                </button>
              ))}
            </div>
          </div>

          {(
            [
              { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
              { key: 'denoise', label: 'Noise Reduction', min: 0, max: 50 },
              { key: 'contrast', label: 'Contrast', min: -30, max: 40 },
              { key: 'brightness', label: 'Brightness', min: -25, max: 25 },
              { key: 'saturation', label: 'Saturation', min: -30, max: 40 },
            ] as const
          ).map((ctrl) => (
            <div key={ctrl.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={`slider-${ctrl.key}`} className="text-slate-700 dark:text-slate-300 font-medium">
                  {ctrl.label}
                </label>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {settings[ctrl.key]}
                </span>
              </div>
              <input
                id={`slider-${ctrl.key}`}
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                value={settings[ctrl.key]}
                onChange={(e) => updateSetting(ctrl.key, Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          ))}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="export-fmt" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Export Format
              </label>
              <select
                id="export-fmt"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="image/png">PNG (Lossless)</option>
                <option value="image/webp">WebP (92%)</option>
                <option value="image/jpeg">JPEG (92%)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!enhancedUrl || processing}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{processing ? 'Processing...' : 'Export Enhanced Image'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
