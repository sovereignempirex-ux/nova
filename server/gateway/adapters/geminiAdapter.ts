import { ThinkingLevel } from '@google/genai';
import { getGeminiClient } from '../../gemini.ts';

export const geminiAdapter = {
  slug: 'google_gemini',

  async streamChat(params: {
    model: string;
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
    systemInstruction?: string;
    thinkingLevel?: ThinkingLevel;
  }) {
    const ai = getGeminiClient();
    const config: Record<string, unknown> = {};
    if (params.systemInstruction) {
      config.systemInstruction = params.systemInstruction;
    }
    if (params.thinkingLevel) {
      config.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    }
    return ai.models.generateContentStream({
      model: params.model,
      contents: params.contents,
      config,
    });
  },

  async generateImage(params: {
    model: string;
    prompt: string;
    aspectRatio: string;
    imageSize?: string;
  }) {
    const ai = getGeminiClient();
    const imageConfig: Record<string, string> = {
      aspectRatio: params.aspectRatio,
    };
    if (params.model === 'gemini-nano-banana-2.1' && params.imageSize) {
      imageConfig.imageSize = params.imageSize;
    }
    return ai.models.generateContent({
      model: params.model,
      contents: { parts: [{ text: params.prompt }] },
      config: { imageConfig },
    });
  },
};
