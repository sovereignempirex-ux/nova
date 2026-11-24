import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canExecuteCircuit,
  checkDailyQuota,
  checkRateLimit,
  classifyGatewayError,
  getProviderCooldownRemainingSec,
  recordCircuitFailure,
  recordCircuitSuccess,
  redactSensitiveObject,
  redactSensitiveString,
  setProviderCooldown,
} from '../server/gateway/reliability.ts';
import { resolveCompatibleFallback } from '../server/gateway/registry.ts';
import { getFreeRouterCandidates, selectBestFreeModel } from '../server/gateway/router.ts';
import { getApiHealthMatrix } from '../server/gateway/apiTester.ts';
import { DISCOVERED_FREE_PROVIDERS, OPEN_SOURCE_MODEL_EVALUATIONS } from '../server/gateway/freeProviderCatalog.ts';
import { getLanguageMeta, isValidLanguageCode, SUPPORTED_LANGUAGES } from '../shared/languages.ts';
import {
  buildStructuredDataForPage,
  scoreSeoPage,
  validateStructuredData,
} from '../server/seo/seoAudit.ts';
import {
  deleteSeoPage,
  getHreflangAlternates,
  getSeoPageByPath,
  publishOrUpdateSeoPage,
} from '../server/seo/seoEngine.ts';
import {
  generateRobotsTxt,
  generateSitemapIndexXml,
  generateSubSitemapXml,
} from '../server/seo/sitemapGenerator.ts';
import { injectSeoIntoHtml } from '../server/seo/ssrMeta.ts';
import {
  extractDailymotionVideoId,
  extractVimeoVideoId,
  extractYouTubeVideoId,
  formatVideoTime,
  NOVA_VIDEO_CSP_HEADER,
  resolveVideoSource,
} from '../shared/videoSource.ts';
import { isPrivateIpAddress, validatePublicHttpUrl } from '../server/services/urlSafety.ts';
import { createTemporarySignedUrl } from '../server/services/supabaseService.ts';

test('Secret redaction scrubs API keys, Bearer tokens, and secret object fields', () => {
  const raw = 'Authorization: Bearer secret_token_123456 api_key=AIzaSyExampleKey12345';
  const redacted = redactSensitiveString(raw);
  assert.ok(!redacted.includes('secret_token_123456'));
  assert.ok(!redacted.includes('AIzaSyExampleKey12345'));

  const obj = redactSensitiveObject({
    provider: 'test',
    apiKey: 'my-secret-value',
    nested: { clientSecret: 'shhh', safeField: 'visible' },
  });
  assert.equal(obj.apiKey, '[REDACTED]');
  assert.equal((obj.nested as Record<string, unknown>).clientSecret, '[REDACTED]');
  assert.equal((obj.nested as Record<string, unknown>).safeField, 'visible');
});

test('Rate limiter blocks after exceeding configured max requests', () => {
  const key = `test-ip-${Date.now()}`;
  const r1 = checkRateLimit(key, 2, 10_000);
  const r2 = checkRateLimit(key, 2, 10_000);
  const r3 = checkRateLimit(key, 2, 10_000);
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, false);
  assert.ok(r3.retryAfterSec >= 1);
});

test('Circuit breaker opens after 5 consecutive failures and resets on success', () => {
  const slug = `unit-test-provider-${Date.now()}`;
  assert.equal(canExecuteCircuit(slug), true);
  for (let i = 0; i < 5; i += 1) {
    recordCircuitFailure(slug);
  }
  assert.equal(canExecuteCircuit(slug), false);
  recordCircuitSuccess(slug);
  assert.equal(canExecuteCircuit(slug), true);
});

test('Error classification identifies timeouts and missing credentials', () => {
  const timeoutErr = classifyGatewayError(new Error('The operation timed out'));
  assert.equal(timeoutErr.classification, 'UPSTREAM_TIMEOUT');
  assert.equal(timeoutErr.retryable, true);

  const authErr = classifyGatewayError(new Error('GEMINI_API_KEY is not configured'));
  assert.equal(authErr.classification, 'MISSING_CREDENTIALS');
  assert.equal(authErr.retryable, false);
});

test('Fallback compatibility guard never replaces image generation with text-only model', () => {
  const fb = resolveCompatibleFallback({
    capability: 'text-to-image',
    primaryModelId: 'free_ai_custom:qwen7b',
    requiresImageInput: false,
  });
  if (fb) {
    assert.ok(
      fb.capabilities.includes('text-to-image') || fb.capabilities.includes('image_generation'),
      'Fallback model must support image output'
    );
    assert.ok(fb.outputTypes.includes('image'));
  }
});

test('39-language registry validates RTL/LTR and BCP-47 hreflang codes', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 39);
  assert.equal(isValidLanguageCode('ar'), true);
  assert.equal(isValidLanguageCode('zh-CN'), true);
  assert.equal(isValidLanguageCode('invalid-xx'), false);
  assert.equal(getLanguageMeta('ar').dir, 'rtl');
  assert.equal(getLanguageMeta('ur').dir, 'rtl');
  assert.equal(getLanguageMeta('en').dir, 'ltr');
});

test('Hreflang alternates never include unpublished languages', () => {
  const home = getSeoPageByPath('/en/tools/ai-chat');
  assert.ok(home);
  const alternates = getHreflangAlternates(home);
  assert.ok(alternates.some((a) => a.hreflang === 'ar'));
  assert.ok(alternates.some((a) => a.hreflang === 'x-default'));
  // Finnish ('fi') has not been published for /tools/ai-chat
  assert.equal(alternates.some((a) => a.hreflang === 'fi'), false);
});

test('Measurable SEO scorer computes explicit deductions and rejects fake ratings', () => {
  const badSchema = {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'SoftwareApplication', aggregateRating: { ratingValue: 5, reviewCount: 99 } }],
  };
  const sdErrors = validateStructuredData(badSchema);
  assert.ok(sdErrors.some((e) => e.includes('prohibited')));

  const validSd = buildStructuredDataForPage(
    {
      pageType: 'guide',
      title: 'Thin',
      description: 'Short',
      canonicalUrl: 'https://nova.vanitasbot.my.id/guides/thin-test',
      path: '/guides/thin-test',
      lang: 'en',
    },
    'https://nova.vanitasbot.my.id'
  );
  const result = scoreSeoPage(
    {
      id: 'test-thin',
      slug: 'thin-test',
      path: '/guides/thin-test',
      pageType: 'guide',
      lang: 'en',
      title: 'Thin',
      description: 'Short',
      h1: '',
      canonicalUrl: 'https://nova.vanitasbot.my.id/guides/thin-test',
      robots: 'index,follow',
      status: 'draft',
      indexingStatus: 'excluded',
      contentMarkdown: 'Too short.',
      internalLinks: [],
      structuredData: validSd,
      seoScore: 0,
      scoreBreakdown: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    []
  );
  assert.ok(result.totalScore < 70);
  const allDeductions = result.breakdown.flatMap((b) => b.deductions);
  assert.ok(allDeductions.some((d) => d.includes('Thin content')));
  assert.ok(allDeductions.some((d) => d.includes('Missing primary H1')));
});

test('Sitemap XML, robots.txt, and SSR meta injection output valid SEO markup', () => {
  const robots = generateRobotsTxt();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml/);

  const indexXml = generateSitemapIndexXml();
  assert.match(indexXml, /<sitemapindex/);
  assert.match(indexXml, /\/sitemaps\/intl\.xml<\/loc>/);

  const intlXml = generateSubSitemapXml('intl');
  assert.match(intlXml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(intlXml, /hreflang="ar"/);

  const baseHtml = `<!doctype html><html lang="en" class="dark"><head><title>Default</title><meta name="description" content="Default" /><link rel="canonical" href="https://nova.vanitasbot.my.id/" /><meta property="og:url" content="https://nova.vanitasbot.my.id/" /><meta property="og:title" content="Default" /><meta property="og:description" content="Default" /><meta name="twitter:title" content="Default" /><meta name="twitter:description" content="Default" /><script type="application/ld+json">{}</script></head><body></body></html>`;
  const arHtml = injectSeoIntoHtml(baseHtml, '/ar/tools/ai-chat', 'https://nova.vanitasbot.my.id');
  assert.match(arHtml, /<html lang="ar" dir="rtl"/);
  assert.match(arHtml, /rel="alternate" hreflang="en"/);
  assert.match(arHtml, /NOVA/);
});

test('Publishing and deleting SEO pages updates sitemap cleanly', () => {
  const page = publishOrUpdateSeoPage({
    slug: 'unit-test-seo-page',
    path: '/guides/unit-test-seo-page',
    pageType: 'guide',
    lang: 'en',
    title: 'NOVA Unit Test SEO Guide Page Verification',
    description:
      'Automated integration test verifying NOVA SEO page publishing, structured data generation, and sitemap synchronization.',
    h1: 'NOVA Unit Test SEO Guide',
    contentMarkdown:
      'This automated verification confirms that newly published NOVA guides receive Schema.org JSON-LD markup, internal links, measurable SEO scores, and inclusion inside the guides XML sub-sitemap.',
  });
  assert.ok(page.seoScore >= 80);
  const guidesXmlBefore = generateSubSitemapXml('guides');
  assert.match(guidesXmlBefore, /\/guides\/unit-test-seo-page/);

  const deleted = deleteSeoPage(page.id);
  assert.equal(deleted, true);
  const guidesXmlAfter = generateSubSitemapXml('guides');
  assert.ok(!guidesXmlAfter.includes('/guides/unit-test-seo-page'));
});

test('Centralized Free AI Router enforces free-only policy and strict capability I/O', () => {
  const textCandidates = getFreeRouterCandidates({ capability: 'text_generation', lang: 'ar' });
  assert.ok(textCandidates.length >= 2);
  for (const c of textCandidates) {
    assert.equal(c.model.tier, 'free');
    assert.ok(c.model.capabilities.includes('text_generation'));
  }

  const imageCandidates = getFreeRouterCandidates({ capability: 'text-to-image' });
  assert.ok(imageCandidates.length >= 1);
  for (const c of imageCandidates) {
    assert.equal(c.model.tier, 'free');
    assert.ok(c.model.outputTypes.includes('image'));
    assert.notEqual(c.providerSlug, 'pollinations_text');
  }

  const bestImage = selectBestFreeModel({ capability: 'text-to-image' });
  assert.ok(bestImage);
  assert.ok(bestImage.model.outputTypes.includes('image'));
});

test('Daily quota guard, provider cooldowns, and 402 FREE_LIMIT error classification work properly', () => {
  const qKey = `unit-quota-${Date.now()}`;
  assert.equal(checkDailyQuota(qKey, 2).allowed, true);
  assert.equal(checkDailyQuota(qKey, 2).allowed, true);
  const blocked = checkDailyQuota(qKey, 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);

  // Cooldown excludes provider from active routing
  setProviderCooldown('pollinations_image', 45);
  assert.ok(getProviderCooldownRemainingSec('pollinations_image') > 0);
  const imgCandidatesDuringCooldown = getFreeRouterCandidates({ capability: 'text-to-image' });
  assert.equal(
    imgCandidatesDuringCooldown.some((c) => c.providerSlug === 'pollinations_image'),
    false
  );
  // Clear cooldown back to 0 for subsequent tests
  setProviderCooldown('pollinations_image', -1);

  const err402 = classifyGatewayError(new Error('{"code":"FREE_LIMIT","message":"1 image every 45 seconds"}'), 402);
  assert.equal(err402.classification, 'UPSTREAM_RATE_LIMIT');
  assert.equal(err402.retryable, true);
});

test('API Health Matrix and Free Discovery Catalog distinguish trials and expose valid availability statuses', () => {
  const allowedStatuses = new Set([
    'Working',
    'Degraded',
    'Unavailable',
    'Not tested',
    'Authentication required',
    'Rate limited',
  ]);
  const matrixData = getApiHealthMatrix();
  assert.ok(matrixData.matrix.length >= 10);
  for (const row of matrixData.matrix) {
    assert.ok(allowedStatuses.has(row.connectionStatus), `Unexpected status: ${row.connectionStatus}`);
    assert.ok(row.freeTierLimits.length > 0);
  }

  const cohere = DISCOVERED_FREE_PROVIDERS.find((p) => p.slug === 'cohere_trial');
  assert.ok(cohere);
  assert.equal(cohere.tierClassification, 'Limited Trial / Credit');

  assert.ok(OPEN_SOURCE_MODEL_EVALUATIONS.length >= 4);
  assert.ok(OPEN_SOURCE_MODEL_EVALUATIONS.every((oss) => oss.canRunOnCurrentNodeHost === false));
});

test('Embedded Video Player extracts and validates YouTube, Vimeo, Dailymotion, HTML5 MP4, and HLS sources', () => {
  // YouTube formats
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/abcDEF12345'), 'abcDEF12345');
  assert.equal(extractYouTubeVideoId('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'), 'M7lc1UVf-VE');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/@SomeChannel'), null);

  const yt = resolveVideoSource('https://www.youtube.com/watch?v=jfKfPfyJRdk', {
    origin: 'https://nova.vanitasbot.my.id',
  });
  assert.equal(yt.kind, 'youtube');
  assert.equal(yt.embeddable, true);
  assert.equal(yt.videoId, 'jfKfPfyJRdk');
  assert.ok(yt.embedUrl?.startsWith('https://www.youtube.com/embed/jfKfPfyJRdk'));

  // Vimeo & Dailymotion
  assert.equal(extractVimeoVideoId(new URL('https://vimeo.com/76979871')), '76979871');
  const vimeo = resolveVideoSource('https://vimeo.com/76979871');
  assert.equal(vimeo.kind, 'vimeo');
  assert.equal(vimeo.embeddable, true);
  assert.equal(vimeo.embedUrl, 'https://player.vimeo.com/video/76979871?dnt=1');

  assert.equal(extractDailymotionVideoId(new URL('https://www.dailymotion.com/video/x84sh87')), 'x84sh87');
  const dm = resolveVideoSource('https://dai.ly/x84sh87');
  assert.equal(dm.kind, 'dailymotion');
  assert.equal(dm.embeddable, true);

  // Direct MP4 & HLS .m3u8
  const mp4 = resolveVideoSource('https://cdn.example.com/clip.mp4');
  assert.equal(mp4.kind, 'html5_video');
  assert.equal(mp4.embeddable, true);

  const mp4ByMime = resolveVideoSource('https://cdn.example.com/stream?id=99', { mimeType: 'video/mp4' });
  assert.equal(mp4ByMime.kind, 'html5_video');
  assert.equal(mp4ByMime.embeddable, true);

  const hls = resolveVideoSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  assert.equal(hls.kind, 'hls_stream');
  assert.equal(hls.embeddable, true);
});

test('Embedded Video Player blocks unsafe schemes, rejects non-embeddable hosts, formats timestamps, and enforces CSP', () => {
  const xssAttempt = resolveVideoSource('javascript:alert(1)');
  assert.equal(xssAttempt.kind, 'unsupported');
  assert.equal(xssAttempt.embeddable, false);

  const unsupportedWeb = resolveVideoSource('https://github.com/sovereignempirex-ux/nova');
  assert.equal(unsupportedWeb.kind, 'unsupported');
  assert.equal(unsupportedWeb.embeddable, false);
  assert.ok(unsupportedWeb.reason?.includes('github.com'));

  const badYt = resolveVideoSource('https://www.youtube.com/playlist?list=PL123');
  assert.equal(badYt.embeddable, false);

  assert.equal(formatVideoTime(0), '0:00');
  assert.equal(formatVideoTime(75), '1:15');
  assert.equal(formatVideoTime(3661), '1:01:01');
  assert.equal(formatVideoTime(Number.NaN), '0:00');

  assert.ok(NOVA_VIDEO_CSP_HEADER.includes("object-src 'none'"));
  assert.ok(NOVA_VIDEO_CSP_HEADER.includes('https://www.youtube.com'));
  assert.ok(NOVA_VIDEO_CSP_HEADER.includes('https://player.vimeo.com'));
  assert.ok(!NOVA_VIDEO_CSP_HEADER.includes("frame-ancestors 'none'"));
});

test('URL safety blocks SSRF private IPs, localhost, and unsafe schemes while permitting public URLs', async () => {
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('10.0.0.5'), true);
  assert.equal(isPrivateIpAddress('169.254.169.254'), true);
  assert.equal(isPrivateIpAddress('192.168.1.1'), true);
  assert.equal(isPrivateIpAddress('::1'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);

  const localhostRes = await validatePublicHttpUrl('http://localhost:3000/api/health');
  assert.equal(localhostRes.ok, false);

  const metadataRes = await validatePublicHttpUrl('http://169.254.169.254/latest/meta-data/');
  assert.equal(metadataRes.ok, false);

  const jsRes = await validatePublicHttpUrl('javascript:alert(1)');
  assert.equal(jsRes.ok, false);

  const publicIpRes = await validatePublicHttpUrl('https://8.8.8.8/dns-query');
  assert.equal(publicIpRes.ok, true);
});

test('Watch route is indexed in SEO catalog and tools sitemap, and /admin injects noindex', () => {
  const watchPage = getSeoPageByPath('/watch');
  assert.ok(watchPage, '/watch must exist in SEO catalog');
  assert.equal(watchPage.status, 'published');

  const toolsXml = generateSubSitemapXml('tools');
  assert.match(toolsXml, /\/watch<\/loc>/);

  const baseHtml = `<!doctype html><html lang="en" class="dark"><head><title>Default</title><meta name="description" content="Default" /><link rel="canonical" href="https://nova.vanitasbot.my.id/" /><meta property="og:url" content="https://nova.vanitasbot.my.id/" /><meta property="og:title" content="Default" /><meta property="og:description" content="Default" /><meta name="twitter:title" content="Default" /><meta name="twitter:description" content="Default" /><script type="application/ld+json">{}</script></head><body></body></html>`;
  const watchHtml = injectSeoIntoHtml(baseHtml, '/watch', 'https://nova.vanitasbot.my.id');
  assert.match(watchHtml, /<meta name="robots" content="index,follow"/);

  const adminHtml = injectSeoIntoHtml(baseHtml, '/admin', 'https://nova.vanitasbot.my.id');
  assert.match(adminHtml, /<meta name="robots" content="noindex,nofollow"/);
});

test('Supabase signed URL helper rejects traversal and non-generated storage paths', async () => {
  await assert.rejects(() => createTemporarySignedUrl('../secrets.json'), /Invalid storage path/);
  await assert.rejects(() => createTemporarySignedUrl('generated/../escape.png'), /Invalid storage path/);
  await assert.rejects(() => createTemporarySignedUrl('private/file.png'), /Invalid storage path/);
  await assert.rejects(() => createTemporarySignedUrl('generated/sub/dir.png'), /Invalid storage path/);
});


