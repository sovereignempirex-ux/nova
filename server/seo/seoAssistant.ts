import { getLanguageMeta, isValidLanguageCode } from '../../shared/languages.ts';
import { freeAiAdapter } from '../gateway/adapters/freeAiAdapter.ts';
import { geminiAdapter } from '../gateway/adapters/geminiAdapter.ts';
import { executeGatewayCall } from '../gateway/gateway.ts';

export interface SeoDraftSuggestion {
  reviewStatus: 'draft';
  targetLanguage: string;
  providerUsed: string;
  modelUsed: string;
  title: string;
  description: string;
  h1: string;
  contentMarkdown: string;
  faqs: Array<{ question: string; answer: string }>;
  notes: string;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function generateSeoDraftWithAi(input: {
  topicOrPath: string;
  targetLang: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourceBody?: string;
}): Promise<SeoDraftSuggestion> {
  if (!isValidLanguageCode(input.targetLang)) {
    throw new Error(`Unsupported target language "${input.targetLang}".`);
  }
  const langMeta = getLanguageMeta(input.targetLang);

  const instruction = [
    `You are an expert technical SEO editor for NOVA (https://nova.vanitasbot.my.id, part of the Vanitas ecosystem).`,
    `Generate an accurate, human-grade SEO draft in ${langMeta.name} (${langMeta.nativeName}, language code ${langMeta.code}).`,
    `Topic / Target Path: ${input.topicOrPath}`,
    input.sourceTitle ? `Reference Title: ${input.sourceTitle}` : '',
    input.sourceDescription ? `Reference Description: ${input.sourceDescription}` : '',
    input.sourceBody ? `Reference Context: ${input.sourceBody}` : '',
    `Rules:`,
    `- Never invent fake ratings, prices, metrics, or unavailable features.`,
    `- Keep title between 35 and 62 characters.`,
    `- Keep description between 110 and 158 characters.`,
    `- Write helpful body content (at least 260 characters) describing real NOVA functionality.`,
    `- Return ONLY valid JSON matching: {"title":"...","description":"...","h1":"...","contentMarkdown":"...","faqs":[{"question":"...","answer":"..."}]}`,
  ]
    .filter(Boolean)
    .join('\n');

  const preferGemini = Boolean(process.env.GEMINI_API_KEY);

  if (preferGemini) {
    const gw = await executeGatewayCall({
      providerSlug: 'google_gemini',
      modelId: 'gemini-4-hydrogen',
      capability: 'text_generation',
      type: 'text',
      endpoint: 'seo-assistant:gemini',
      method: 'POST',
      execute: async () => {
        const stream = await geminiAdapter.streamChat({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
        });
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk.text ?? '';
        }
        return fullText;
      },
    });

    if (gw.success && typeof gw.data === 'string') {
      const parsed = extractJsonObject(gw.data);
      if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
        return {
          reviewStatus: 'draft',
          targetLanguage: langMeta.code,
          providerUsed: gw.provider,
          modelUsed: gw.model,
          title: String(parsed.title).slice(0, 75),
          description: String(parsed.description).slice(0, 175),
          h1: String(parsed.h1 || parsed.title),
          contentMarkdown: String(parsed.contentMarkdown || gw.data),
          faqs: Array.isArray(parsed.faqs)
            ? (parsed.faqs as Array<{ question?: unknown; answer?: unknown }>)
                .filter((f) => typeof f.question === 'string' && typeof f.answer === 'string')
                .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
            : [],
          notes: 'Draft generated for admin review. Nothing is published until explicitly saved.',
        };
      }
    }
  }

  // Fallback / default free SSE provider: free_ai_custom qwen7b
  const gwFree = await executeGatewayCall({
    providerSlug: 'free_ai_custom',
    modelId: 'free_ai_custom:qwen7b',
    capability: 'text_generation',
    type: 'text',
    endpoint: 'seo-assistant:free_ai_custom',
    method: 'POST',
    execute: async () => {
      const res = await freeAiAdapter.streamChat([{ role: 'user', content: instruction }], {
        onDelta: () => {},
        onImage: () => {},
      });
      return res.text;
    },
  });

  if (!gwFree.success || typeof gwFree.data !== 'string' || !gwFree.data.trim()) {
    throw new Error(gwFree.error?.message || 'AI SEO Assistant providers are currently unavailable.');
  }

  const parsed = extractJsonObject(gwFree.data);
  if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
    return {
      reviewStatus: 'draft',
      targetLanguage: langMeta.code,
      providerUsed: gwFree.provider,
      modelUsed: gwFree.model,
      title: String(parsed.title).slice(0, 75),
      description: String(parsed.description).slice(0, 175),
      h1: String(parsed.h1 || parsed.title),
      contentMarkdown: String(parsed.contentMarkdown || gwFree.data),
      faqs: Array.isArray(parsed.faqs)
        ? (parsed.faqs as Array<{ question?: unknown; answer?: unknown }>)
            .filter((f) => typeof f.question === 'string' && typeof f.answer === 'string')
            .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
        : [],
      notes: 'Draft generated via Free AI Custom Qwen 7B for admin review.',
    };
  }

  return {
    reviewStatus: 'draft',
    targetLanguage: langMeta.code,
    providerUsed: gwFree.provider,
    modelUsed: gwFree.model,
    title: `${input.sourceTitle || input.topicOrPath} (${langMeta.code.toUpperCase()}) | NOVA`.slice(0, 68),
    description: (input.sourceDescription || `Explore ${input.topicOrPath} in ${langMeta.nativeName} on NOVA.`).slice(0, 165),
    h1: input.sourceTitle || input.topicOrPath,
    contentMarkdown: gwFree.data.trim(),
    faqs: [],
    notes: 'Returned raw AI draft for editorial formatting before publication.',
  };
}
