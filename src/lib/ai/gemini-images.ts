/**
 * Gemini native image generation (Nano Banana family).
 * Uses generateContent with responseModalities IMAGE; see `wired-models.ts`.
 */

import { getGeminiApiKey } from "@/lib/ai/gemini";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiImageSize = "0.5K" | "1K" | "2K" | "4K";

export type GeminiImageGenerateInput = {
  modelSlug: string;
  prompt: string;
  /** Square output; default 1K (~1024). Stories may use 0.5K. */
  imageSize?: GeminiImageSize;
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9";
};

export type GeminiImageGenerateResult = {
  dataUrl: string;
  modelSlug: string;
};

type GeminiInlinePart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlinePart[];
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

function partToDataUrl(part: GeminiInlinePart): string | null {
  const camel = part.inlineData;
  if (camel?.data?.trim()) {
    const mime = camel.mimeType?.trim() || "image/png";
    return `data:${mime};base64,${camel.data.trim()}`;
  }
  const snake = part.inline_data;
  if (snake?.data?.trim()) {
    const mime = snake.mime_type?.trim() || "image/png";
    return `data:${mime};base64,${snake.data.trim()}`;
  }
  return null;
}

/**
 * Generates one image via Gemini Image models (`gemini-3.1-flash-image`, …).
 */
export async function generateWithGeminiImage(
  input: GeminiImageGenerateInput,
): Promise<GeminiImageGenerateResult> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(input.modelSlug)}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: input.aspectRatio ?? "1:1",
        imageSize: input.imageSize ?? "1K",
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as GeminiImageResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Gemini-Bildgenerierung fehlgeschlagen (${response.status}).`,
    );
  }

  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const dataUrl = partToDataUrl(part);
    if (dataUrl) {
      return { dataUrl, modelSlug: input.modelSlug };
    }
  }

  throw new Error("Gemini hat kein Bild zurückgegeben.");
}
