/**
 * Routes pixel generation by `ai_models.provider`.
 * Supported: ionos-image (FLUX) and gemini-image (Nano Banana).
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { generateWithGeminiImage } from "@/lib/ai/gemini-images";
import { generateIonosImage } from "@/lib/ai/ionos-images";

export type GenerateImageInput = {
  model: AiModelConfig;
  prompt: string;
  /**
   * Approximate square edge in px.
   * IONOS: exact size string; Gemini: mapped to 0.5K / 1K / 2K.
   */
  sizePx?: 256 | 512 | 1024 | 2048;
  /** Prefer PNG for social overlays (avoids double JPEG softening). */
  outputFormat?: "png" | "jpeg" | "webp";
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
 * Generates one image with the configured catalog model.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  if (!input.model.isActive) {
    throw new Error(`Das Modell „${input.model.label}“ ist deaktiviert.`);
  }

  const provider = input.model.provider.trim().toLowerCase();

  if (provider === "ionos-image") {
    const result = await generateIonosImage({
      prompt: input.prompt,
      size: ionosSizeForPx(input.sizePx),
      modelSlug: input.model.modelSlug,
      outputFormat:
        input.outputFormat ??
        (input.sizePx && input.sizePx >= 1024 ? "jpeg" : "png"),
    });
    return { dataUrl: result.dataUrl, modelSlug: result.modelSlug };
  }

  if (provider === "gemini-image") {
    const result = await generateWithGeminiImage({
      modelSlug: input.model.modelSlug,
      prompt: input.prompt,
      imageSize: geminiSizeForPx(input.sizePx),
      aspectRatio: "1:1",
    });
    return { dataUrl: result.dataUrl, modelSlug: result.modelSlug };
  }

  throw new Error(
    `Provider „${input.model.provider}“ erzeugt keine Bilder. Bitte „ionos-image“ oder „gemini-image“ wählen.`,
  );
}
