/**
 * Social Media caption (text model) + image (scene plan → images-default pixels).
 */

import { generateImage } from "@/lib/ai/generate-image";
import { generateText } from "@/lib/ai/provider";
import {
  FALLBACK_AI_MODELS,
  type AiModelConfig,
} from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import {
  buildCraftCaptionPrompt,
  buildCraftRefinePrompt,
  buildSocialFluxPromptFromScene,
  buildSocialImageScenePlanPrompt,
} from "@/lib/social/craft-prompt";
import {
  getMotivationAngleById,
  pickMotivationAngle,
  type MotivationAngle,
} from "@/lib/social/motivation";
import { overlayExactAngleTextOnImage } from "@/lib/social/overlay-angle-text";
import type { SocialChannel, SocialChannelCraft } from "@/lib/social/types";

function resolveAngle(
  angleId: string | undefined,
  postDate: string,
): MotivationAngle {
  if (angleId) {
    const found = getMotivationAngleById(angleId);
    if (!found) {
      throw new Error(`Unbekannter Winkel „${angleId}“.`);
    }
    return found;
  }
  return pickMotivationAngle(postDate);
}

function dayMeta(postDate: string): { dayIndex: number; daysInMonth: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(postDate);
  if (!match) return { dayIndex: 1, daysInMonth: 31 };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return {
    dayIndex: day,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

/** Resolves text model for captions and scene briefs (`social-default`). */
export async function resolveSocialTextModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const model =
      catalog.models.find((m) => m.id === "social-default") ??
      catalog.models.find((m) => m.id === "story-default") ??
      catalog.models.find(
        (m) =>
          m.provider === "gemini" &&
          m.modelSlug.includes("flash") &&
          m.isActive,
      );
    if (model?.isActive) return model;
  } catch {
    /* fallback */
  }
  const fallback =
    FALLBACK_AI_MODELS.find((m) => m.id === "social-default") ??
    FALLBACK_AI_MODELS.find((m) => m.id === "story-default");
  if (!fallback) {
    throw new Error("Social-/Gemini-Modell fehlt im Katalog.");
  }
  return fallback;
}

/**
 * Pixel model for Social images — same catalog row as story illustrations
 * (`images-default`: FLUX or Gemini Image).
 */
export async function resolveSocialImagesModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const model = catalog.models.find((m) => m.id === "images-default");
    if (model?.isActive) return model;
  } catch {
    /* fallback */
  }
  const fallback = FALLBACK_AI_MODELS.find((m) => m.id === "images-default");
  if (!fallback) {
    throw new Error("Illustrationsmodell (images-default) fehlt im Katalog.");
  }
  return fallback;
}

export type SocialAiModelInfo = {
  id: string;
  label: string;
  modelSlug: string;
  provider: string;
};

function toModelInfo(model: AiModelConfig): SocialAiModelInfo {
  return {
    id: model.id,
    label: model.label,
    modelSlug: model.modelSlug,
    provider: model.provider,
  };
}

/** Admin UI: which catalog models Social text / image generation will use. */
export async function getSocialAiModels(): Promise<{
  text: SocialAiModelInfo;
  images: SocialAiModelInfo;
}> {
  const [text, images] = await Promise.all([
    resolveSocialTextModel(),
    resolveSocialImagesModel(),
  ]);
  return { text: toModelInfo(text), images: toModelInfo(images) };
}

export async function generateSocialCaption(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  postDate: string;
  angleId: string;
}): Promise<{ caption: string; angle: MotivationAngle }> {
  const model = await resolveSocialTextModel();
  const angle = resolveAngle(input.angleId, input.postDate);
  const { dayIndex, daysInMonth } = dayMeta(input.postDate);
  const prompt = buildCraftCaptionPrompt({
    storyline: input.storyline,
    craft: input.craft,
    channel: input.channel,
    postDate: input.postDate,
    dayIndex,
    daysInMonth,
    angle,
  });
  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  return { caption: text.trim(), angle };
}

export async function refineSocialCaption(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  currentCaption: string;
  refineInstruction: string;
  postDate: string;
  angleId?: string | null;
}): Promise<{ caption: string; angle: MotivationAngle }> {
  const model = await resolveSocialTextModel();
  const angle = resolveAngle(input.angleId ?? undefined, input.postDate);
  const prompt = buildCraftRefinePrompt({ ...input, angle });
  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  return { caption: text.trim(), angle };
}

/**
 * Text model invents a scene from the caption; `images-default` renders pixels.
 * Winkel title is composited in Nunito afterwards.
 */
export async function generateSocialImage(input: {
  imagePromptTemplate: string;
  caption: string;
  channel: SocialChannel;
  postDate: string;
  angleId: string;
  extraInstruction?: string;
}): Promise<{
  dataUrl: string;
  promptUsed: string;
  sceneDescription: string;
  angle: MotivationAngle;
}> {
  const [textModel, imagesModel] = await Promise.all([
    resolveSocialTextModel(),
    resolveSocialImagesModel(),
  ]);
  const angle = resolveAngle(input.angleId, input.postDate);
  const plan = buildSocialImageScenePlanPrompt({
    ...input,
    sceneHint: angle.sceneHint,
  });
  const sceneRaw = await generateText({
    model: textModel,
    systemInstruction: plan.systemInstruction,
    userText: plan.userText,
  });
  const sceneDescription = sceneRaw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!sceneDescription) {
    throw new Error("Textmodell hat keine Bildszene geliefert.");
  }

  const promptUsed = buildSocialFluxPromptFromScene({
    sceneDescription,
    imagePromptTemplate: input.imagePromptTemplate,
    postDate: input.postDate,
    extraInstruction: input.extraInstruction,
  });

  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    // 2K when the provider supports it (Gemini); IONOS still caps at 1024.
    sizePx: 2048,
    outputFormat: "png",
  });

  // Exact Winkel title in Nunito (white) — image models cannot render this reliably.
  const dataUrl = await overlayExactAngleTextOnImage({
    imageDataUrl: result.dataUrl,
    overlayText: angle.title,
  });

  return { dataUrl, promptUsed, sceneDescription, angle };
}
