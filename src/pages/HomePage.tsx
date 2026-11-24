import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  DownloadCloud,
  Film,
  Image as ImageIcon,
  MessageSquare,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useLanguage } from '../lib/LanguageContext';
import heroImage from '../assets/images/nova_workspace_hero_1795512844169.jpg';
import studioPreview from '../assets/images/nova_image_studio_preview_1795512843208.jpg';
import animeShowcase from '../assets/images/nova_anime_showcase_1795512844823.jpg';

export const HomePage: React.FC = () => {
  const { t } = useLanguage();

  usePageMeta(
    'NOVA — Vanitas AI, Media & Anime Platform',
    'Explore NOVA in the Vanitas ecosystem: AI chat streaming, image generation, image enhancement, multi-source search, media downloader, and anime hub.',
    '/'
  );

  const modules = [
    {
      title: t('aiStudio'),
      path: '/ai-studio',
      category: t('modAiCategory'),
      summary: t('modAiSummary'),
      icon: MessageSquare,
    },
    {
      title: t('imageStudio'),
      path: '/image-studio',
      category: t('modImgCategory'),
      summary: t('modImgSummary'),
      icon: ImageIcon,
    },
    {
      title: t('imageEnhancer'),
      path: '/image-enhancer',
      category: t('modEnhCategory'),
      summary: t('modEnhSummary'),
      icon: SlidersHorizontal,
    },
    {
      title: t('search'),
      path: '/search',
      category: t('modSearchCategory'),
      summary: t('modSearchSummary'),
      icon: Compass,
    },
    {
      title: t('downloader'),
      path: '/downloader',
      category: t('modDlCategory'),
      summary: t('modDlSummary'),
      icon: DownloadCloud,
    },
    {
      title: t('animeHub'),
      path: '/anime',
      category: t('modAnimeCategory'),
      summary: t('modAnimeSummary'),
      icon: Film,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12 space-y-12">
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {t('heroTagline')}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white text-balance leading-[1.12]">
              {t('heroTitle')}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t('heroSummary')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/ai-studio"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <span>{t('openAiStudio')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              to="/anime"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <span>{t('exploreAnime')}</span>
            </Link>
            <Link
              to="/watch"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              <span>{t('openVideoPlayer')}</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
            <img
              src={heroImage}
              alt="NOVA architectural workspace studio interior"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Core Modules Grid */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
              {t('coreModulesHeading')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t('coreModulesSubheading')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.path}
                to={mod.path}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {mod.category}
                    </span>
                    <Icon
                      className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {mod.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {mod.summary}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <span>{t('openModule')}</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Visual Spotlights */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link
          to="/image-enhancer"
          className="group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] flex flex-col"
        >
          <div className="aspect-[16/9] overflow-hidden bg-slate-900">
            <img
              src={studioPreview}
              alt="Precision optical lens and glass prism in Image Studio"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          </div>
          <div className="p-6 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('spotlightImgSub')}
            </p>
            <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              {t('spotlightImgTitle')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('spotlightImgSummary')}
            </p>
          </div>
        </Link>

        <Link
          to="/anime"
          className="group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] flex flex-col"
        >
          <div className="aspect-[16/9] overflow-hidden bg-slate-900">
            <img
              src={animeShowcase}
              alt="Twilight anime skyline overlooking commuter rail station"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          </div>
          <div className="p-6 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('spotlightAnimeSub')}
            </p>
            <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              {t('spotlightAnimeTitle')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('spotlightAnimeSummary')}
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
};
