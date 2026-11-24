import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getLanguageMeta,
  isValidLanguageCode,
  SUPPORTED_LANGUAGES,
  type LanguageDefinition,
} from '../../shared/languages';

export type AppLanguage = string;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    overview: 'Overview',
    aiStudio: 'AI Studio',
    imageStudio: 'Image Studio',
    imageEnhancer: 'Image Enhancer',
    enhancerShort: 'Enhancer',
    search: 'Search',
    watchPlayer: 'Video Player',
    downloader: 'Downloader',
    animeHub: 'Anime Hub',
    apiReference: 'API Reference',
    platformAdmin: 'Platform & Admin',
    apiAdmin: 'API Admin',
    seoEngine: 'SEO Engine',
    launchAiStudio: 'Launch AI Studio',
    darkWorkspace: 'Dark Workspace',
    lightWorkspace: 'Light Workspace',
    languageLabel: 'Language',
    signInGoogle: 'Sign in with Google',
    cloudSyncActive: 'Cloud sync active',
    footerTagline: 'NOVA · Vanitas Ecosystem · Free Open Platform',
    offlineMode: 'Offline Mode — Cached workspace assets active',
    conversations: 'Conversations',
    newChat: 'New',
    systemPrompt: 'System Prompt',
    send: 'Send',
    stop: 'Stop',
    retry: 'Retry',
    attachImage: 'Attach Image',
    clearImage: 'Remove',
    generateImage: 'Generate Image',
    queuingJob: 'Queuing Job...',
    jobHistory: 'Job History',
    loadIntoEnhancer: 'Enhance',
    uploadImage: 'Upload Image',
    aiAutoTune: 'AI Auto-Tune',
    searchBtn: 'Search',
    searching: 'Searching...',
    inspectUrl: 'Inspect URL',
    inspecting: 'Inspecting...',
    downloadFile: 'Download File',
    heroTagline: 'Vanitas Ecosystem · Free Creative & Media Platform',
    heroTitle: 'Six focused tools for AI, imagery, search, and anime',
    heroSummary:
      'NOVA brings streaming conversational models, asynchronous image generation, real-time pixel enhancement, multi-source discovery, embedded video playback, direct media inspection, and AniList exploration into one unified workspace.',
    openAiStudio: 'Open AI Studio',
    exploreAnime: 'Explore Anime Hub',
    openVideoPlayer: 'Video Player',
    coreModulesHeading: 'Core Platform Modules',
    coreModulesSubheading:
      'Each module runs on its own dedicated route with live server integration and state persistence.',
    openModule: 'Open module',
    modAiCategory: 'Conversational AI',
    modAiSummary:
      'Multi-turn streaming chat with model selection, reasoning depth controls, and cloud thread history.',
    modImgCategory: 'Visual Synthesis',
    modImgSummary:
      'Asynchronous prompt-to-image generation with job queue tracking, aspect ratio presets, and history.',
    modEnhCategory: 'Optical Processing',
    modEnhSummary:
      'Client-side 4x resolution upscaling, unsharp mask sharpening, split-screen comparison, and AI diagnostics.',
    modSearchCategory: 'Multi-Source Index',
    modSearchSummary:
      'Query YouTube, Pinterest, Wikipedia, GitHub, npm, and AniList with embedded in-page video playback.',
    modDlCategory: 'Media Transfer',
    modDlSummary:
      'Inspect remote media headers, preview embedded videos, verify MIME types and file sizes, and stream downloads safely.',
    modAnimeCategory: 'Catalog & Details',
    modAnimeSummary:
      'Browse trending and top-rated anime from AniList with embedded trailers, studios, and personal bookmarks.',
    spotlightImgSub: 'Image Studio · Image Enhancer',
    spotlightImgTitle: 'Optical-grade upscaling and creative synthesis',
    spotlightImgSummary:
      'Sharpen details up to 4x locally with real-time split-screen inspection, or run AI Auto-Tune diagnostics.',
    spotlightAnimeSub: 'Anime Hub · Live AniList GraphQL',
    spotlightAnimeTitle: 'Discover seasonal releases, studios, and character casts',
    spotlightAnimeSummary:
      'Filter by genre, format, and community score, watch embedded trailers, and bookmark favorites.',
    animeHeading: 'Anime Hub',
    animeSubheading:
      'Live AniList GraphQL discovery across trending series, studios, ratings, trailers, and personal bookmarks.',
    sortTrending: 'Trending',
    sortPopular: 'Popular',
    sortTopRated: 'Top Rated',
    previousPage: 'Previous',
    nextPage: 'Next',
    downloaderHeading: 'Media Downloader',
    downloaderSubheading:
      'Inspect social media links via Nezuko Downloader API or verify direct file headers, sizes, and stream safe files.',
    searchHeading: 'Multi-Source Search',
    searchSubheading:
      'Query YouTube, Pinterest, Wikipedia, GitHub repositories, npm packages, and AniList simultaneously with embedded playback.',
    watchHeading: 'Embedded Video Player',
    watchSubheading:
      'Play YouTube, Vimeo, Dailymotion, Twitch, MP4, WebM, and HLS streams inside NOVA without leaving the platform.',
  },
  ar: {
    overview: 'نظرة عامة',
    aiStudio: 'استوديو الذكاء',
    imageStudio: 'استوديو الصور',
    imageEnhancer: 'محسن الصور',
    enhancerShort: 'تحسين الصور',
    search: 'البحث',
    watchPlayer: 'مشغل الفيديو',
    downloader: 'أداة التحميل',
    animeHub: 'بوابة الأنمي',
    apiReference: 'مرجع API',
    platformAdmin: 'المنصة والإدارة',
    apiAdmin: 'إدارة البوابة',
    seoEngine: 'محرك السيو',
    launchAiStudio: 'فتح استوديو الذكاء',
    darkWorkspace: 'الوضع الداكن',
    lightWorkspace: 'الوضع الفاتح',
    languageLabel: 'اللغة',
    signInGoogle: 'تسجيل الدخول عبر Google',
    cloudSyncActive: 'المزامنة السحابية مفعلة',
    footerTagline: 'NOVA · منظومة Vanitas · منصة مجانية مفتوحة',
    offlineMode: 'وضع عدم الاتصال — الأصول المخزنة مؤقتًا نشطة',
    conversations: 'المحادثات',
    newChat: 'جديد',
    systemPrompt: 'توجيه النظام',
    send: 'إرسال',
    stop: 'إيقاف',
    retry: 'إعادة المحاولة',
    attachImage: 'إرفاق صورة',
    clearImage: 'إزالة',
    generateImage: 'توليد الصورة',
    queuingJob: 'جاري إرسال الطلب...',
    jobHistory: 'سجل المهام',
    loadIntoEnhancer: 'تحسين',
    uploadImage: 'رفع صورة',
    aiAutoTune: 'ضبط تلقائي بالذكاء',
    searchBtn: 'بحث',
    searching: 'جاري البحث...',
    inspectUrl: 'فحص الرابط',
    inspecting: 'جاري الفحص...',
    downloadFile: 'تنزيل الملف',
    heroTagline: 'منظومة Vanitas · منصة إبداعية ووسائط مجانية',
    heroTitle: 'ست أدوات متخصصة للذكاء الاصطناعي والصور والبحث والأنمي',
    heroSummary:
      'تجمع NOVA نماذج المحادثة المتدفقة وتوليد الصور غير المتزامن وتحسين الدقة الفوري والبحث متعدد المصادر ومشغل الفيديو المدمج وفحص الروابط واستكشاف AniList في مساحة عمل موحدة.',
    openAiStudio: 'فتح استوديو الذكاء',
    exploreAnime: 'استكشاف بوابة الأنمي',
    openVideoPlayer: 'مشغل الفيديو',
    coreModulesHeading: 'وحدات المنصة الأساسية',
    coreModulesSubheading:
      'تعمل كل وحدة على مسار مستقل مع تكامل مباشر مع الخادم وحفظ حالة الاستخدام.',
    openModule: 'فتح الوحدة',
    modAiCategory: 'محادثات الذكاء الاصطناعي',
    modAiSummary:
      'محادثة متدفقة متعددة الأدوار مع اختيار النماذج وضبط عمق الاستدلال وحفظ السجل سحابيًا.',
    modImgCategory: 'توليد الصور',
    modImgSummary:
      'توليد الصور من النصوص بشكل غير متزامن مع تتبع قائمة المهام ونسب الأبعاد والسجل.',
    modEnhCategory: 'المعالجة البصرية',
    modEnhSummary:
      'تكبير الدقة حتى 4 أضعاف محليًا مع زيادة الحدة والمقارنة الفورية وتشخيص الذكاء الاصطناعي.',
    modSearchCategory: 'فهرس بحث متعدد المصادر',
    modSearchSummary:
      'ابحث في يوتيوب وبنترست وويكيبيديا وGitHub وnpm وAniList مع تشغيل الفيديو داخل الصفحة.',
    modDlCategory: 'نقل وفحص الوسائط',
    modDlSummary:
      'فحص روابط الوسائط ومعاينة الفيديوهات المدمجة والتحقق من نوع وحجم الملفات وتنزيلها بأمان.',
    modAnimeCategory: 'دليل وتفاصيل الأنمي',
    modAnimeSummary:
      'تصفح الأنمي الرائج والأعلى تقييمًا من AniList مع العروض الدعائية المدمجة والاستوديوهات والمفضلة.',
    spotlightImgSub: 'استوديو الصور · محسن الصور',
    spotlightImgTitle: 'تحسين الدقة البصري والتوليد الإبداعي للصور',
    spotlightImgSummary:
      'ارفع حدة التفاصيل حتى 4 أضعاف محليًا مع معاينة الانقسام الفورية أو الضبط التلقائي بالذكاء.',
    spotlightAnimeSub: 'بوابة الأنمي · AniList GraphQL المباشر',
    spotlightAnimeTitle: 'اكتشف المواسم الجديدة والاستوديوهات وطاقم الشخصيات',
    spotlightAnimeSummary:
      'تصفية حسب التصنيف والصيغة والتقييم، ومشاهدة العروض الدعائية داخل المنصة، وحفظ المفضلة.',
    animeHeading: 'بوابة الأنمي',
    animeSubheading:
      'استكشاف مباشر من AniList عبر السلاسل الرائجة والاستوديوهات والتقييمات والعروض الدعائية والمفضلة.',
    sortTrending: 'الرائج',
    sortPopular: 'الأكثر شعبية',
    sortTopRated: 'الأعلى تقييمًا',
    previousPage: 'السابق',
    nextPage: 'التالي',
    downloaderHeading: 'أداة تحميل الوسائط',
    downloaderSubheading:
      'افحص روابط الوسائط الاجتماعية عبر واجهة Nezuko أو تحقق من الترويسات والأحجام ونزّل الملفات المباشرة بأمان.',
    searchHeading: 'البحث متعدد المصادر',
    searchSubheading:
      'ابحث في يوتيوب وبنترست وويكيبيديا ومستودعات GitHub وحزم npm وAniList مع تشغيل الفيديو المدمج.',
    watchHeading: 'مشغل الفيديو المدمج',
    watchSubheading:
      'شغّل فيديوهات YouTube وVimeo وDailymotion وTwitch وملفات MP4 وWebM وHLS داخل NOVA دون مغادرة المنصة.',
  },
  fr: {
    overview: 'Aperçu',
    aiStudio: 'Studio IA',
    imageStudio: 'Studio Image',
    imageEnhancer: 'Amélioration',
    enhancerShort: 'Amélioration',
    search: 'Recherche',
    watchPlayer: 'Lecteur Vidéo',
    downloader: 'Téléchargeur',
    animeHub: 'Portail Anime',
    apiReference: 'Référence API',
    platformAdmin: 'Plateforme & Admin',
    apiAdmin: 'Admin API',
    seoEngine: 'Moteur SEO',
    launchAiStudio: 'Ouvrir Studio IA',
    languageLabel: 'Langue',
    offlineMode: 'Mode hors ligne — Ressources en cache actives',
  },
  es: {
    overview: 'Resumen',
    aiStudio: 'Estudio IA',
    imageStudio: 'Estudio Imagen',
    imageEnhancer: 'Mejorador',
    enhancerShort: 'Mejorador',
    search: 'Buscar',
    watchPlayer: 'Reproductor',
    downloader: 'Descargas',
    animeHub: 'Anime Hub',
    apiReference: 'Referencia API',
    platformAdmin: 'Plataforma y Admin',
    apiAdmin: 'Admin API',
    seoEngine: 'Motor SEO',
    launchAiStudio: 'Abrir Estudio IA',
    languageLabel: 'Idioma',
    offlineMode: 'Modo sin conexión — Recursos en caché activos',
  },
  de: {
    overview: 'Übersicht',
    aiStudio: 'KI-Studio',
    imageStudio: 'Bildstudio',
    imageEnhancer: 'Bildverbesserung',
    enhancerShort: 'Optimierer',
    search: 'Suche',
    watchPlayer: 'Video-Player',
    downloader: 'Downloader',
    animeHub: 'Anime Hub',
    apiReference: 'API-Referenz',
    platformAdmin: 'Plattform & Admin',
    apiAdmin: 'API-Admin',
    seoEngine: 'SEO-Engine',
    launchAiStudio: 'KI-Studio starten',
    languageLabel: 'Sprache',
    offlineMode: 'Offline-Modus — Zwischengespeicherte Assets aktiv',
  },
  ja: {
    overview: '概要',
    aiStudio: 'AIスタジオ',
    imageStudio: '画像スタジオ',
    imageEnhancer: '高画質化',
    enhancerShort: '高画質化',
    search: '検索',
    watchPlayer: '動画プレーヤー',
    downloader: 'ダウンローダー',
    animeHub: 'アニメハブ',
    apiReference: 'APIリファレンス',
    platformAdmin: '管理・設定',
    apiAdmin: 'API管理',
    seoEngine: 'SEO管理',
    launchAiStudio: 'AIスタジオを開く',
    languageLabel: '言語',
    offlineMode: 'オフラインモード — キャッシュ資産が有効です',
  },
  id: {
    overview: 'Ringkasan',
    aiStudio: 'AI Studio',
    imageStudio: 'Studio Gambar',
    imageEnhancer: 'Peningkat Gambar',
    enhancerShort: 'Peningkat',
    search: 'Pencarian',
    watchPlayer: 'Pemutar Video',
    downloader: 'Pengunduh',
    animeHub: 'Anime Hub',
    apiReference: 'Referensi API',
    platformAdmin: 'Platform & Admin',
    apiAdmin: 'Admin API',
    seoEngine: 'Mesin SEO',
    launchAiStudio: 'Buka AI Studio',
    languageLabel: 'Bahasa',
    offlineMode: 'Mode Luring — Aset cache aktif',
  },
};

interface LanguageContextValue {
  lang: AppLanguage;
  dir: 'ltr' | 'rtl';
  languageMeta: LanguageDefinition;
  supportedLanguages: LanguageDefinition[];
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  dir: 'ltr',
  languageMeta: SUPPORTED_LANGUAGES[0],
  supportedLanguages: SUPPORTED_LANGUAGES,
  setLang: () => {},
  toggleLang: () => {},
  t: (key: string) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem('nova-lang');
      return isValidLanguageCode(saved) ? saved! : 'en';
    } catch {
      return 'en';
    }
  });

  const languageMeta = getLanguageMeta(lang);
  const dir = languageMeta.dir;

  useEffect(() => {
    document.documentElement.lang = languageMeta.hreflang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem('nova-lang', lang);
    } catch {
      // Ignore storage failures in private contexts
    }
  }, [lang, dir, languageMeta.hreflang]);

  const setLang = (next: AppLanguage) => {
    if (isValidLanguageCode(next)) {
      setLangState(next);
    }
  };
  const toggleLang = () => setLangState((prev) => (prev === 'en' ? 'ar' : 'en'));
  const t = (key: string) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;

  return (
    <LanguageContext.Provider
      value={{
        lang,
        dir,
        languageMeta,
        supportedLanguages: SUPPORTED_LANGUAGES,
        setLang,
        toggleLang,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  return useContext(LanguageContext);
}
