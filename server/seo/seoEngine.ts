import { randomUUID } from 'node:crypto';
import { getLanguageMeta, isValidLanguageCode } from '../../shared/languages.ts';
import { listModels } from '../gateway/registry.ts';
import { getSupabaseClient } from '../services/supabaseService.ts';
import {
  buildStructuredDataForPage,
  computeLanguageCoverage,
  recommendInternalLinksForPage,
  scoreSeoPage,
  validateStructuredData,
} from './seoAudit.ts';
import type {
  SeoAutomationLog,
  SeoFaqItem,
  SeoIndexingStatus,
  SeoPageRecord,
  SeoPageType,
  SeoPublicationStatus,
  SeoRedirectRule,
} from './types.ts';

const SITE_ORIGIN = (process.env.APP_URL || 'https://nova.vanitasbot.my.id').replace(/\/+$/, '');

const seoPages = new Map<string, SeoPageRecord>();
const seoRedirects = new Map<string, SeoRedirectRule>();
const automationLogs: SeoAutomationLog[] = [];

interface LocalizedToolCopy {
  lang: string;
  tools: Record<
    string,
    {
      title: string;
      description: string;
      h1: string;
      body: string;
      faqs?: SeoFaqItem[];
    }
  >;
}

const LOCALIZED_TOOL_CATALOG: LocalizedToolCopy[] = [
  {
    lang: 'en',
    tools: {
      'ai-chat': {
        title: 'AI Chat Studio — Free Streaming Chat | NOVA',
        description:
          'Stream bilingual answers from Google Gemini, Free AI Custom Qwen 7B, and Nezuko chat models with image upload and history sync.',
        h1: 'NOVA AI Chat Studio',
        body: 'NOVA AI Studio connects directly through the NOVA API Gateway to stream multi-turn answers from Google Gemini, Free AI Custom Qwen 7B, and Nezuko models. Switch between English and Arabic, upload PNG/JPEG/WebP images for visual analysis, and render SSE-generated artwork inline.',
        faqs: [
          {
            question: 'Which AI chat models are free to run in NOVA AI Studio?',
            answer: 'Free AI Custom Qwen 7B, Nezuko Gemini Chat, Nezuko Qwen 7B, Gemini 4 Hydrogen, and Gemini 3.1 Flash Lite are available on the free tier when server keys are active.',
          },
          {
            question: 'Can I attach an image to a conversation?',
            answer: 'Yes. Select Nezuko Gemini Chat or a Gemini model to upload PNG, JPEG, or WebP images alongside your prompt.',
          },
        ],
      },
      'image-generator': {
        title: 'AI Image Generator — Free Text to Image | NOVA',
        description:
          'Generate images asynchronously using Free AI Custom Qwen 7B (SDXL), Nezuko Flux, or Gemini image providers with private storage.',
        h1: 'NOVA Image Generator',
        body: 'Queue asynchronous text-to-image jobs with real-time progress polling, MIME type verification, and private Supabase nova-assets bucket storage with temporary signed URLs.',
      },
      'image-enhancer': {
        title: 'Image Enhancer — 4x Upscaler & Sharpening | NOVA',
        description:
          'Upscale images up to 4x in your browser, apply unsharp mask sharpening, reduce noise, and run Gemini Auto-Tune or Nezuko Image-to-HD.',
        h1: 'NOVA Image Enhancer',
        body: 'Perform lossless client-side 4x resolution upscaling, spatial noise reduction, contrast tuning, and live split-screen before-and-after inspection.',
      },
      'media-downloader': {
        title: 'Media Downloader — URL Inspector & Streamer | NOVA',
        description:
          'Inspect media URLs for file headers, MIME types, and byte sizes via Nezuko Media Extractor or Direct URL validation before downloading.',
        h1: 'NOVA Media Downloader',
        body: 'Validate public media URLs safely with redirect inspection, MIME verification, byte-level progress tracking, and transfer history.',
      },
      'multi-search': {
        title: 'Multi-Source Search — YouTube, Pinterest & Web | NOVA',
        description:
          'Search YouTube videos, Pinterest pins, Gemini web grounding, Wikipedia, GitHub repositories, npm packages, and AniList from one interface.',
        h1: 'NOVA Multi-Source Search',
        body: 'Query seven live knowledge and media indexes simultaneously with clean source filtering and direct inspection links.',
      },
    },
  },
  {
    lang: 'ar',
    tools: {
      'ai-chat': {
        title: 'استوديو محادثة الذكاء الاصطناعي — البث المباشر | NOVA',
        description:
          'تحدث باللغة العربية والإنجليزية مع نماذج Free AI Qwen 7B وNezuko وGoogle Gemini مع دعم رفع الصور والبث الفوري.',
        h1: 'استوديو الذكاء الاصطناعي NOVA',
        body: 'يتيح استوديو NOVA إجراء محادثات مباشرة باللغتين العربية والإنجليزية عبر بوابة API موحدة تدعم البث الفوري SSE، وتحليل الصور المرفقة، وتوليد الصور داخل المحادثة.',
        faqs: [
          {
            question: 'هل يدعم استوديو NOVA اللغة العربية؟',
            answer: 'نعم، يدعم التبديل الكامل للواجهة واتجاه RTL بالإضافة إلى تمرير معامل اللغة lang=ar لنماذج Nezuko وFree AI Custom.',
          },
        ],
      },
      'image-generator': {
        title: 'مولد الصور بالذكاء الاصطناعي مجاناً | NOVA',
        description:
          'أنشئ صوراً عالية الدقة عبر Free AI Qwen 7B وNezuko مع تتبع حالة المهام وتخزين آمن في سحابة Supabase الخاصة.',
        h1: 'استوديو توليد الصور NOVA',
        body: 'قم بإرسال أوامر توليد الصور غير المتزامنة مع متابعة الحالة لحظة بلحظة وفحص نوع الملف وحفظه في حاوية nova-assets الخاصة بروابط مؤقتة.',
      },
      'image-enhancer': {
        title: 'محسن الصور — تكبير 4x وزيادة الحدة | NOVA',
        description:
          'ارفع دقة الصور حتى 4 أضعاف داخل المتصفح مع تقليل الضوضاء وتحسين التباين والمقارنة المباشرة قبل وبعد التعديل.',
        h1: 'محسن الصور NOVA',
        body: 'أداة معالجة صور عالية الدقة تعمل داخل المتصفح لرفع الجودة وتقليل التشويش مع خيار الضبط التلقائي بالذكاء الاصطناعي.',
      },
      'media-downloader': {
        title: 'أداة فحص وتحميل الوسائط المباشرة | NOVA',
        description:
          'افحص روابط الفيديو والصور والملفات للتحقق من نوع MIME والحجم الفعلي قبل التنزيل المباشر بأمان.',
        h1: 'أداة تحميل الوسائط NOVA',
        body: 'افحص الروابط العامة وتحقق من الترويسات والأحجام قبل تنزيل الملفات مع تتبع نسبة التقدم وسجل التنزيلات.',
      },
      'multi-search': {
        title: 'محرك البحث متعدد المصادر — يوتيوب وبنترست والويب | NOVA',
        description:
          'ابحث في يوتيوب وبنترست وويكيبيديا وجيت هب وحزم npm وAniList من شاشة واحدة موحدة.',
        h1: 'البحث متعدد المصادر NOVA',
        body: 'استعلم عبر مصادر المعرفة والفيديو والصور البرمجية والأنمي في وقت واحد مع عرض منظم للنتائج.',
      },
    },
  },
  {
    lang: 'fr',
    tools: {
      'ai-chat': {
        title: 'Studio Chat IA — Streaming Gratuit | NOVA',
        description:
          'Discutez en streaming avec Google Gemini, Free AI Qwen 7B et Nezuko avec prise en charge multilingue et envoi d’images.',
        h1: 'Studio Chat IA NOVA',
        body: 'Le studio NOVA connecte plusieurs fournisseurs via une passerelle API sécurisée pour générer du texte en streaming SSE et analyser des images.',
      },
      'image-generator': {
        title: 'Générateur d’Images IA Gratuit | NOVA',
        description:
          'Créez des images via Free AI Custom Qwen 7B et Nezuko avec suivi des tâches asynchrones et stockage privé Supabase.',
        h1: 'Studio Image NOVA',
        body: 'Soumettez des requêtes de génération d’images avec suivi d’état en direct, validation MIME et téléchargement instantané.',
      },
    },
  },
  {
    lang: 'es',
    tools: {
      'ai-chat': {
        title: 'Estudio de Chat IA — Respuestas en Streaming | NOVA',
        description:
          'Conversa en tiempo real con Google Gemini, Free AI Qwen 7B y Nezuko con soporte multilingüe e imágenes.',
        h1: 'Estudio de Chat IA NOVA',
        body: 'NOVA conecta proveedores de IA mediante una pasarela unificada con límites de velocidad, disyuntores y soporte multilingüe.',
      },
      'image-generator': {
        title: 'Generador de Imágenes IA Gratis | NOVA',
        description:
          'Genera imágenes con seguimiento de trabajos asíncronos y almacenamiento privado en Supabase nova-assets.',
        h1: 'Estudio de Imagen NOVA',
        body: 'Crea imágenes a partir de texto con validación automática de formato PNG/JPEG/WebP y enlaces temporales firmados.',
      },
    },
  },
  {
    lang: 'de',
    tools: {
      'ai-chat': {
        title: 'KI-Chat-Studio — Kostenloses SSE-Streaming | NOVA',
        description:
          'Nutzen Sie Google Gemini, Free AI Qwen 7B und Nezuko im einheitlichen KI-Studio mit Bild-Upload und Mehrsprachigkeit.',
        h1: 'NOVA KI-Chat-Studio',
        body: 'Das NOVA KI-Studio bündelt verifizierte Sprach- und Bildmodelle über ein zentrales API-Gateway mit Fehlerklassifizierung und Fallback.',
      },
    },
  },
  {
    lang: 'ja',
    tools: {
      'ai-chat': {
        title: 'AIチャットスタジオ — 無料SSEストリーミング | NOVA',
        description:
          'Google Gemini、Free AI Qwen 7B、Nezukoを統合したマルチリンガルAIチャットと画像解析ワークスペース。',
        h1: 'NOVA AIチャットスタジオ',
        body: 'NOVA APIゲートウェイを通じて複数のAIプロバイダーに安全に接続し、リアルタイムのSSE応答と画像生成を実行できます。',
      },
    },
  },
  {
    lang: 'id',
    tools: {
      'ai-chat': {
        title: 'AI Chat Studio — Streaming Gratis | NOVA Vanitas',
        description:
          'Gunakan Google Gemini, Free AI Custom Qwen 7B, dan Nezuko API dalam satu workspace dengan dukungan unggah gambar.',
        h1: 'NOVA AI Chat Studio',
        body: 'Platform NOVA dari ekosistem Vanitas menyediakan akses gratis ke model AI chat streaming, pembuatan gambar, dan pencarian multi-sumber.',
      },
    },
  },
];

function computeAndStorePage(raw: Omit<SeoPageRecord, 'seoScore' | 'scoreBreakdown' | 'structuredData'> & { structuredData?: Record<string, unknown> }): SeoPageRecord {
  const draft: SeoPageRecord = {
    ...raw,
    structuredData: raw.structuredData || buildStructuredDataForPage(raw, SITE_ORIGIN),
    seoScore: 0,
    scoreBreakdown: [],
  };
  const all = Array.from(seoPages.values());
  const { totalScore, breakdown } = scoreSeoPage(draft, all);
  draft.seoScore = totalScore;
  draft.scoreBreakdown = breakdown;
  seoPages.set(draft.id, draft);
  return draft;
}

function seedSeoPages() {
  const ts = new Date().toISOString();

  const corePages: Array<{
    id: string;
    slug: string;
    path: string;
    pageType: SeoPageType;
    title: string;
    description: string;
    h1: string;
    contentMarkdown: string;
    hreflangGroup?: string;
    faqs?: SeoFaqItem[];
  }> = [
    {
      id: 'seo_home',
      slug: 'home',
      path: '/',
      pageType: 'core',
      hreflangGroup: 'core-home',
      title: 'NOVA — Vanitas AI, Media & Anime Platform',
      description:
        'Explore NOVA in the Vanitas ecosystem: AI chat streaming, image generation, 4x image enhancement, multi-source search, media downloader, and anime hub.',
      h1: 'NOVA Creative & AI Platform',
      contentMarkdown:
        'NOVA is a free, multi-module workspace inside the Vanitas ecosystem uniting AI streaming chat, text-to-image generation, 4x browser image enhancement, multi-source discovery across YouTube and Pinterest, media header inspection, and AniList anime cataloging.',
    },
    {
      id: 'seo_ai_studio',
      slug: 'ai-studio',
      path: '/ai-studio',
      pageType: 'tool',
      hreflangGroup: 'tool-ai-chat',
      title: 'AI Studio — Streaming Multi-Model Chat | NOVA',
      description:
        'Chat with Google Gemini, Free AI Custom Qwen 7B, and Nezuko Gemini/Qwen models in Arabic and English with multimodal image support.',
      h1: 'AI Studio',
      contentMarkdown:
        'Stream responses with low latency across multiple verified AI providers. Attach images for visual reasoning, configure system instructions, and persist conversation threads securely.',
    },
    {
      id: 'seo_image_studio',
      slug: 'image-studio',
      path: '/image-studio',
      pageType: 'tool',
      hreflangGroup: 'tool-image-generator',
      title: 'Image Studio — Asynchronous AI Image Generation | NOVA',
      description:
        'Generate images using Free AI Custom Qwen 7B, Nezuko Flux, Monte AI, and Gemini with live job tracking and private Supabase storage.',
      h1: 'Image Studio',
      contentMarkdown:
        'Submit visual prompts to configured image providers, monitor queued and processing states, validate PNG/JPEG/WebP payloads, and issue temporary signed URLs from private storage.',
    },
    {
      id: 'seo_image_enhancer',
      slug: 'image-enhancer',
      path: '/image-enhancer',
      pageType: 'tool',
      hreflangGroup: 'tool-image-enhancer',
      title: 'Image Enhancer — 4x Upscaling & Split Compare | NOVA',
      description:
        'Upscale images up to 4x in your browser, apply unsharp masking, reduce noise, and run Gemini Auto-Tune or Nezuko Image-to-HD.',
      h1: 'Image Enhancer',
      contentMarkdown:
        'Run high-precision client-side resolution upscaling and convolution sharpening with live split-screen comparison and lossless PNG, WebP, or JPEG export.',
    },
    {
      id: 'seo_search',
      slug: 'search',
      path: '/search',
      pageType: 'tool',
      hreflangGroup: 'tool-multi-search',
      title: 'Multi-Source Search — YouTube, Pinterest & Web | NOVA',
      description:
        'Search YouTube videos, Pinterest pins, Gemini Web Grounding, Wikipedia, GitHub, npm, and AniList from one fast interface.',
      h1: 'Multi-Source Search',
      contentMarkdown:
        'Query live video, visual pin, code, package, encyclopedia, and anime indexes in parallel with zero fabricated results.',
    },
    {
      id: 'seo_downloader',
      slug: 'downloader',
      path: '/downloader',
      pageType: 'tool',
      hreflangGroup: 'tool-media-downloader',
      title: 'Media Downloader — Header Validation & Streaming | NOVA',
      description:
        'Inspect public media links and social URLs via Nezuko Media Extractor or Direct HTTP validation before streaming downloads.',
      h1: 'Media Downloader',
      contentMarkdown:
        'Verify remote MIME types, byte sizes, and redirect targets safely before streaming media files with real progress tracking.',
    },
    {
      id: 'seo_anime',
      slug: 'anime',
      path: '/anime',
      pageType: 'tool',
      hreflangGroup: 'tool-anime-explorer',
      title: 'Anime Hub — Live AniList Catalog & Bookmarks | NOVA',
      description:
        'Browse trending, popular, and seasonal anime powered by live AniList GraphQL data with detailed character and studio views.',
      h1: 'Anime Hub',
      contentMarkdown:
        'Discover trending series, search anime titles by genre or season, inspect synopsis and scores, and bookmark favorites across devices.',
    },
    {
      id: 'seo_watch',
      slug: 'watch',
      path: '/watch',
      pageType: 'tool',
      hreflangGroup: 'tool-video-player',
      title: 'Embedded Video Player — YouTube, HTML5 & HLS | NOVA',
      description:
        'Watch YouTube, Vimeo, Dailymotion, MP4, WebM, and HLS video streams directly inside NOVA with responsive speed and timeline controls.',
      h1: 'NOVA Embedded Video Player',
      contentMarkdown:
        'Play supported YouTube IFrame API embeds, Vimeo, Dailymotion, HTML5 direct video files, and adaptive HLS streams directly inside NOVA without external redirects.',
    },
    {
      id: 'seo_cat_ai',
      slug: 'ai-models',
      path: '/categories/ai-models',
      pageType: 'category',
      hreflangGroup: 'cat-ai-models',
      title: 'AI Models Directory — Verified NOVA Integrations',
      description:
        'Browse verified text, multimodal, search, and text-to-image models connected to the NOVA API Gateway with live capability flags.',
      h1: 'AI Models Category',
      contentMarkdown:
        'Every model listed in NOVA includes verified input/output types, supported languages, streaming capabilities, and real-time provider health status.',
    },
    {
      id: 'seo_doc_gateway',
      slug: 'api-gateway',
      path: '/docs/api-gateway',
      pageType: 'doc',
      hreflangGroup: 'doc-api-gateway',
      title: 'NOVA API Gateway & Provider Adapters Documentation',
      description:
        'Technical reference for NOVA centralized API Gateway, unified response format, circuit breakers, rate limits, and Nezuko/Free AI adapters.',
      h1: 'API Gateway Architecture',
      contentMarkdown:
        'NOVA routes every external request through a server-side API Gateway enforcing SSRF checks, per-IP rate limiting, circuit breakers, compatible fallback rules, and secret redaction.',
    },
    {
      id: 'seo_guide_ar',
      slug: 'arabic-ai-workflows',
      path: '/guides/arabic-ai-workflows',
      pageType: 'guide',
      hreflangGroup: 'guide-arabic-ai',
      title: 'Arabic AI Workflows Guide — Free AI & Nezuko | NOVA',
      description:
        'Learn how to run Arabic streaming chat, text-to-image generation, and bilingual SEO workflows inside NOVA.',
      h1: 'Arabic AI Workflows in NOVA',
      contentMarkdown:
        'NOVA supports native Arabic RTL layouts alongside lang=ar routing for Free AI Custom Qwen 7B, Nezuko Gemini Chat, and Nezuko Qwen 7B.',
    },
  ];

  for (const p of corePages) {
    computeAndStorePage({
      id: p.id,
      slug: p.slug,
      path: p.path,
      pageType: p.pageType,
      lang: 'en',
      hreflangGroup: p.hreflangGroup,
      title: p.title,
      description: p.description,
      h1: p.h1,
      canonicalUrl: `${SITE_ORIGIN}${p.path}`,
      robots: 'index,follow',
      status: 'published',
      indexingStatus: 'published',
      contentMarkdown: p.contentMarkdown,
      faqs: p.faqs,
      internalLinks: [],
      publishedAt: ts,
      updatedAt: ts,
      createdAt: ts,
    });
  }

  // Seed genuine localized programmatic tool pages (no fake untranslated hreflangs)
  for (const pack of LOCALIZED_TOOL_CATALOG) {
    for (const [toolSlug, copy] of Object.entries(pack.tools)) {
      const path = `/${pack.lang}/tools/${toolSlug}`;
      computeAndStorePage({
        id: `seo_intl_${pack.lang}_${toolSlug}`,
        slug: toolSlug,
        path,
        pageType: 'programmatic_tool',
        lang: pack.lang,
        hreflangGroup: `tool-${toolSlug}`,
        title: copy.title,
        description: copy.description,
        h1: copy.h1,
        canonicalUrl: `${SITE_ORIGIN}${path}`,
        robots: 'index,follow',
        status: 'published',
        indexingStatus: 'published',
        contentMarkdown: copy.body,
        faqs: copy.faqs,
        internalLinks: [],
        publishedAt: ts,
        updatedAt: ts,
        createdAt: ts,
      });
    }
  }

  // Seed programmatic model pages directly from verified Gateway models
  for (const model of listModels({ activeOnly: true })) {
    const slug = model.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const path = `/models/${slug}`;
    computeAndStorePage({
      id: `seo_model_${slug}`,
      slug,
      path,
      pageType: 'model',
      lang: 'en',
      hreflangGroup: `model-${slug}`,
      title: `${model.name} — Capabilities & API Spec | NOVA`,
      description: `${model.description} Verified capabilities: ${model.capabilities.join(', ')}. Languages: ${model.supportedLanguages.join(', ')}.`.slice(0, 158),
      h1: model.name,
      canonicalUrl: `${SITE_ORIGIN}${path}`,
      robots: model.verified ? 'index,follow' : 'noindex,follow',
      status: 'published',
      indexingStatus: model.verified ? 'published' : 'excluded',
      contentMarkdown: `${model.name} is integrated via the ${model.providerSlug} adapter inside the NOVA API Gateway. Supported capabilities: ${model.capabilities.join(', ')}. Input types: ${model.inputTypes.join(', ')}. Output types: ${model.outputTypes.join(', ')}. Streaming: ${model.streamingSupport ? 'Enabled' : 'Standard'}.`,
      internalLinks: [],
      publishedAt: ts,
      updatedAt: ts,
      createdAt: ts,
    });
  }

  // Populate internal links & re-score all pages
  const all = Array.from(seoPages.values());
  for (const page of all) {
    page.internalLinks = recommendInternalLinksForPage(page, all);
    const { totalScore, breakdown } = scoreSeoPage(page, all);
    page.seoScore = totalScore;
    page.scoreBreakdown = breakdown;
  }
}

seedSeoPages();

export function listSeoPages(filter?: {
  pageType?: SeoPageType;
  lang?: string;
  status?: SeoPublicationStatus;
  indexingStatus?: SeoIndexingStatus;
}): SeoPageRecord[] {
  let list = Array.from(seoPages.values());
  if (filter?.pageType) list = list.filter((p) => p.pageType === filter.pageType);
  if (filter?.lang) list = list.filter((p) => p.lang === filter.lang);
  if (filter?.status) list = list.filter((p) => p.status === filter.status);
  if (filter?.indexingStatus) list = list.filter((p) => p.indexingStatus === filter.indexingStatus);
  return list;
}

export function getSeoPageByPath(rawPath: string): SeoPageRecord | undefined {
  const normalized = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
  return Array.from(seoPages.values()).find((p) => p.path === normalized);
}

export function getSeoPageById(id: string): SeoPageRecord | undefined {
  return seoPages.get(id);
}

export function getHreflangAlternates(page: SeoPageRecord): Array<{ hreflang: string; href: string }> {
  if (!page.hreflangGroup || page.status !== 'published' || page.robots.includes('noindex')) {
    return [];
  }
  const peers = Array.from(seoPages.values()).filter(
    (p) =>
      p.hreflangGroup === page.hreflangGroup &&
      p.status === 'published' &&
      !p.robots.includes('noindex') &&
      isValidLanguageCode(p.lang)
  );
  if (peers.length === 0) return [];

  const links = peers.map((p) => ({
    hreflang: getLanguageMeta(p.lang).hreflang,
    href: p.canonicalUrl,
  }));

  const enPeer = peers.find((p) => p.lang === 'en');
  if (enPeer) {
    links.push({ hreflang: 'x-default', href: enPeer.canonicalUrl });
  }
  return links;
}

export function publishOrUpdateSeoPage(input: {
  id?: string;
  slug: string;
  path: string;
  pageType: SeoPageType;
  lang: string;
  hreflangGroup?: string;
  title: string;
  description: string;
  h1: string;
  robots?: string;
  status?: SeoPublicationStatus;
  indexingStatus?: SeoIndexingStatus;
  contentMarkdown: string;
  faqs?: SeoFaqItem[];
}): SeoPageRecord {
  const cleanPath = input.path.startsWith('/') ? input.path.replace(/\/+$/, '') || '/' : `/${input.path}`;
  if (!isValidLanguageCode(input.lang)) {
    throw new Error(`Unsupported language code "${input.lang}". Must be one of the 39 supported languages.`);
  }
  if (!input.title?.trim() || !input.description?.trim() || !input.contentMarkdown?.trim()) {
    throw new Error('Title, meta description, and content body are required before publishing.');
  }

  const existing = input.id ? seoPages.get(input.id) : getSeoPageByPath(cleanPath);
  const duplicateCanonical = Array.from(seoPages.values()).find(
    (p) => p.path === cleanPath && p.id !== existing?.id
  );
  if (duplicateCanonical) {
    throw new Error(`Another SEO record already claims path "${cleanPath}".`);
  }

  const ts = new Date().toISOString();
  const canonicalUrl = `${SITE_ORIGIN}${cleanPath}`;
  const structuredData = buildStructuredDataForPage(
    {
      pageType: input.pageType,
      title: input.title.trim(),
      description: input.description.trim(),
      canonicalUrl,
      path: cleanPath,
      lang: input.lang,
      faqs: input.faqs,
    },
    SITE_ORIGIN
  );

  const sdErrors = validateStructuredData(structuredData);
  if (sdErrors.length > 0) {
    throw new Error(`Structured data validation failed: ${sdErrors.join('; ')}`);
  }

  const all = Array.from(seoPages.values());
  const internalLinks = recommendInternalLinksForPage(
    { path: cleanPath, pageType: input.pageType, lang: input.lang },
    all
  );

  const record = computeAndStorePage({
    id: existing?.id || input.id || `seo_${randomUUID().slice(0, 8)}`,
    slug: input.slug.trim(),
    path: cleanPath,
    pageType: input.pageType,
    lang: input.lang,
    hreflangGroup: input.hreflangGroup || existing?.hreflangGroup,
    title: input.title.trim(),
    description: input.description.trim(),
    h1: input.h1.trim() || input.title.trim(),
    canonicalUrl,
    robots: input.robots || existing?.robots || 'index,follow',
    status: input.status || 'published',
    indexingStatus: input.indexingStatus || (input.status === 'draft' ? 'excluded' : 'published'),
    contentMarkdown: input.contentMarkdown.trim(),
    faqs: input.faqs,
    internalLinks,
    structuredData,
    publishedAt: input.status === 'published' ? existing?.publishedAt || ts : existing?.publishedAt,
    updatedAt: ts,
    createdAt: existing?.createdAt || ts,
  });

  recordSeoAutomationLog({
    jobType: existing ? 'seo_page_updated' : 'seo_page_published',
    status: 'completed',
    pagesScanned: 1,
    issuesFound: record.scoreBreakdown.reduce((n, c) => n + c.deductions.length, 0),
    summary: `Processed ${record.path} (${record.lang}) with internal SEO score ${record.seoScore}/100.`,
  });

  // Best-effort sync to Supabase nova_seo_pages if configured
  const supa = getSupabaseClient();
  if (supa) {
    void supa
      .from('nova_seo_pages')
      .upsert(
        {
          slug: record.slug,
          path: record.path,
          page_type: record.pageType,
          lang: record.lang,
          hreflang_group: record.hreflangGroup || null,
          title: record.title,
          description: record.description,
          canonical_url: record.canonicalUrl,
          robots: record.robots,
          status: record.status,
          indexing_status: record.indexingStatus,
          content_markdown: record.contentMarkdown,
          structured_data: record.structuredData,
          internal_links: record.internalLinks.map((l) => l.path),
          seo_score: record.seoScore,
          score_breakdown: record.scoreBreakdown,
          published_at: record.publishedAt || null,
          updated_at: record.updatedAt,
        },
        { onConflict: 'path' }
      )
      .then(() => {});
  }

  return record;
}

export function deleteSeoPage(id: string, redirectTargetPath?: string): boolean {
  const existing = seoPages.get(id);
  if (!existing) return false;
  seoPages.delete(id);

  if (redirectTargetPath && redirectTargetPath.startsWith('/')) {
    addSeoRedirect(existing.path, redirectTargetPath, 301);
  }

  recordSeoAutomationLog({
    jobType: 'seo_page_removed',
    status: 'completed',
    pagesScanned: 1,
    issuesFound: 0,
    summary: redirectTargetPath
      ? `Removed ${existing.path} from sitemap and created 301 redirect to ${redirectTargetPath}.`
      : `Removed ${existing.path} from sitemap and indexable pages.`,
  });
  return true;
}

export function listSeoRedirects(): SeoRedirectRule[] {
  return Array.from(seoRedirects.values());
}

export function findActiveRedirect(rawPath: string): SeoRedirectRule | undefined {
  const normalized = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
  return Array.from(seoRedirects.values()).find((r) => r.active && r.sourcePath === normalized);
}

export function addSeoRedirect(
  sourcePath: string,
  targetPath: string,
  statusCode: 301 | 302 | 307 | 308 = 301
): SeoRedirectRule {
  const cleanSrc = sourcePath.startsWith('/') ? sourcePath.replace(/\/+$/, '') : `/${sourcePath}`;
  const cleanDst = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const rule: SeoRedirectRule = {
    id: `redir_${randomUUID().slice(0, 8)}`,
    sourcePath: cleanSrc,
    targetPath: cleanDst,
    statusCode,
    active: true,
    createdAt: new Date().toISOString(),
  };
  seoRedirects.set(rule.id, rule);
  return rule;
}

export function deleteSeoRedirect(id: string): boolean {
  return seoRedirects.delete(id);
}

export function recordSeoAutomationLog(entry: Omit<SeoAutomationLog, 'id' | 'createdAt'>): SeoAutomationLog {
  const log: SeoAutomationLog = {
    id: `seojob_${randomUUID().slice(0, 8)}`,
    ...entry,
    createdAt: new Date().toISOString(),
  };
  automationLogs.unshift(log);
  if (automationLogs.length > 100) automationLogs.length = 100;
  return log;
}

export function getSeoAutomationLogs(): SeoAutomationLog[] {
  return automationLogs;
}

export function runSeoAuditAndAutomation() {
  const all = Array.from(seoPages.values());
  const published = all.filter((p) => p.status === 'published');
  const indexable = published.filter((p) => !p.robots.includes('noindex'));

  const titleCounts = new Map<string, number>();
  const descCounts = new Map<string, number>();
  for (const p of published) {
    titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) || 0) + 1);
    descCounts.set(p.description.toLowerCase(), (descCounts.get(p.description.toLowerCase()) || 0) + 1);
  }

  let missingTitles = 0;
  let missingDescriptions = 0;
  let duplicateMetadata = 0;
  let brokenInternalLinks = 0;
  let missingCanonicals = 0;
  let invalidHreflang = 0;
  let structuredDataErrors = 0;
  let thinContentPages = 0;

  const validPaths = new Set(all.map((p) => p.path));

  for (const page of published) {
    const rescored = scoreSeoPage(page, all);
    page.seoScore = rescored.totalScore;
    page.scoreBreakdown = rescored.breakdown;

    if (!page.title.trim()) missingTitles += 1;
    if (!page.description.trim()) missingDescriptions += 1;
    if ((titleCounts.get(page.title.toLowerCase()) || 0) > 1 || (descCounts.get(page.description.toLowerCase()) || 0) > 1) {
      duplicateMetadata += 1;
    }
    if (!page.canonicalUrl) missingCanonicals += 1;
    if (!isValidLanguageCode(page.lang)) invalidHreflang += 1;
    if (validateStructuredData(page.structuredData).length > 0) structuredDataErrors += 1;
    if (page.contentMarkdown.trim().length < 120) thinContentPages += 1;
    for (const link of page.internalLinks) {
      if (!validPaths.has(link.path) && !link.path.startsWith('/anime')) {
        brokenInternalLinks += 1;
      }
    }
  }

  const languageCoverage = computeLanguageCoverage(all);
  const missingTranslations = languageCoverage.filter((l) => !l.hasPublishedSeo).length;
  const avgScore =
    published.length > 0 ? Math.round(published.reduce((s, p) => s + p.seoScore, 0) / published.length) : 0;

  const totalIssues =
    missingTitles +
    missingDescriptions +
    duplicateMetadata +
    brokenInternalLinks +
    missingCanonicals +
    invalidHreflang +
    structuredDataErrors +
    thinContentPages;

  recordSeoAutomationLog({
    jobType: 'full_seo_audit',
    status: 'completed',
    pagesScanned: published.length,
    issuesFound: totalIssues,
    summary: `Scanned ${published.length} published pages (${indexable.length} indexable). Avg internal SEO score: ${avgScore}/100.`,
  });

  return {
    siteOrigin: SITE_ORIGIN,
    summary: {
      totalPublicPages: published.length,
      indexablePages: indexable.length,
      avgInternalScore: avgScore,
      missingTitles,
      missingDescriptions,
      duplicateMetadata,
      brokenInternalLinks,
      missingCanonicals,
      invalidHreflang,
      missingTranslations,
      sitemapErrors: 0,
      structuredDataErrors,
      thinContentPages,
    },
    languageCoverage,
    pages: all,
    redirects: listSeoRedirects(),
    automationLogs: getSeoAutomationLogs(),
  };
}
