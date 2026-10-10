/**
 * Routes pixel generation by `ai_models.provider`.
 * Supported: ionos-image (FLUX), gemini-image (Nano Banana), openai-image (GPT Image).
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { generateWithGeminiImage } from "@/lib/ai/gemini-images";
import { generateIonosImage } from "@/lib/ai/ionos-images";
import {
  generateOpenAiImage,
  type OpenAiImageQuality,
} from "@/lib/ai/openai-images";

export type GenerateImageInput = {
  model: AiModelConfig;
  prompt: string;
  /**
   * Approximate square edge in px.
   * IONOS: exact size string; Gemini: mapped to 0.5K / 1K / 2K.
   */
  sizePx?: 256 | 512 | 1024 | 2048;
  /**
   * Portrait/landscape for non-square outputs (eBook covers etc.).
   * Defaults to 1:1. IONOS maps to a concrete WxH string.
   */
  aspectRatio?: "1:1" | "2:3" | "3:2" | "4:5" | "5:8" | "9:16" | "16:9";
  /**
   * Exact `WIDTHxHEIGHT` for OpenAI / IONOS when the caller needs a native
   * resolution (e.g. cover 1600×2400). Overrides aspectRatio size mapping.
   */
  sizeExact?: string;
  /** Prefer PNG for social overlays (avoids double JPEG softening). */
  outputFormat?: "png" | "jpeg" | "webp";
  /** OpenAI Images quality override (covers use xhigh). Ignored by other providers. */
  quality?: OpenAiImageQuality;
};

export type GenerateImageResult = {
  dataUrl: string;
  modelSlug: string;
};

function geminiSizeForPx(
  sizePx: number | undefined,
): "0.5K" | "1K" | "2K" | "4K" {
  if (!sizePx || sizePx <= 512) return "0.5K";
  if (sizePx <= 1024) return "1K";
  if (sizePx <= 2048) return "2K";
  return "4K";
}

function ionosSizeForPx(sizePx: number | undefined): string {
  if (!sizePx || sizePx <= 256) return "256x256";
  if (sizePx <= 512) return "512x512";
  if (sizePx <= 1024) return "1024x1024";
  return "1024x1024";
}

/**
 * IONOS FLUX.2 sizes: both sides multiples of 16, 64–2048.
 * @see https://docs.ionos.com/cloud/ai/ai-model-hub/models/image-generation-models/flux-2-klein-4b
 */
function ionosSizeForAspect(
  aspectRatio: GenerateImageInput["aspectRatio"],
  sizePx: number | undefined,
): string {
  const large = !sizePx || sizePx > 512;
  switch (aspectRatio) {
    case "2:3":
      // Cover target 1600×2400; IONOS max edge 2048 → 1280×1920 (2:3).
      return large ? "1280x1920" : "640x960";
    case "5:8":
      // Legacy portrait; multiples of 16 under 2048 px edge.
      return large ? "1280x2048" : "640x1024";
    case "3:2":
      return large ? "1536x1024" : "768x512";
    case "4:5":
      return large ? "1024x1280" : "512x640";
    case "9:16":
      return large ? "1088x1920" : "576x1024";
    case "16:9":
      return large ? "1920x1088" : "1024x576";
    case "1:1":
    default:
      return ionosSizeForPx(sizePx);
  }
}

/**
 * OpenAI GPT Image sizes: listed presets + custom resolutions.
 * Cover 2:3 uses native 1600×2400 (no post-upscale).
 */
function openAiSizeForAspect(
  aspectRatio: GenerateImageInput["aspectRatio"],
  sizePx: number | undefined,
): string {
  const large = !sizePx || sizePx > 512;
  switch (aspectRatio) {
    case "2:3":
      return large ? "1600x2400" : "640x960";
    case "5:8":
      return large ? "1280x2048" : "640x1024";
    case "3:2":
      return large ? "1536x1024" : "768x512";
    case "4:5":
      return large ? "1024x1280" : "512x640";
    case "9:16":
      return large ? "1080x1920" : "576x1024";
    case "16:9":
      return large ? "1920x1080" : "1024x576";
    case "1:1":
    default:
      if (!sizePx || sizePx <= 512) return "512x512";
      if (sizePx <= 1024) return "1024x1024";
      return "2048x2048";
  }
}

function normalizeExactSize(raw: string | undefined): string | null {
  const m = /^(\d{2,5})x(\d{2,5})$/i.exec((raw ?? "").trim());
  if (!m) return null;
  return `${Number(m[1])}x${Number(m[2])}`;
}

/**
 * Generates one image with the configured catalog model.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  if (!input.model.isActive) {
    throw new Error(`Das Modell „${input.model.label}“ ist deaktiviert.`);
  }

  const provider = input.model.provider.trim().toLowerCase();
  const aspectRatio = input.aspectRatio ?? "1:1";
  const sizeExact = normalizeExactSize(input.sizeExact);

  if (provider === "ionos-image") {
    const result = await generateIonosImage({
      prompt: input.prompt,
      size: sizeExact ?? ionosSizeForAspect(aspectRatio, input.sizePx),
      modelSlug: input.model.modelSlug,
      outputFormat:
        input.outputFormat ??
        (input.sizePx && input.sizePx >= 1024 ? "jpeg" : "png"),
    });
    return { dataUrl: result.dataUrl, modelSlug: result.modelSlug };
  }

  if (provider === "gemini-image") {
    // Gemini has no 5:8; map legacy 5:8 to 2:3 (cover target).
    const geminiAspect =
      aspectRatio === "5:8" ? "2:3" : aspectRatio;
    const result = await generateWithGeminiImage({
      modelSlug: input.model.modelSlug,
      prompt: input.prompt,
      imageSize: geminiSizeForPx(input.sizePx),
      aspectRatio: geminiAspect,
    });
    return { dataUrl: result.dataUrl, modelSlug: result.modelSlug };
  }

  if (provider === "openai-image") {
    const result = await generateOpenAiImage({
      modelSlug: input.model.modelSlug,
      prompt: input.prompt,
      size: sizeExact ?? openAiSizeForAspect(aspectRatio, input.sizePx),
      quality:
        input.quality ??
        (input.sizePx && input.sizePx >= 1024 ? "high" : "medium"),
      outputFormat:
        input.outputFormat ??
        (input.sizePx && input.sizePx >= 1024 ? "jpeg" : "png"),
    });
    return { dataUrl: result.dataUrl, modelSlug: result.modelSlug };
  }

  throw new Error(
    `Provider „${input.model.provider}“ erzeugt keine Bilder. Bitte „ionos-image“, „gemini-image“ oder „openai-image“ wählen.`,
  );
}
