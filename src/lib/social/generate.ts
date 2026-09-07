/**
 * Social Media caption (Gemini + motivation angle) + image (Gemini scene → FLUX.2).
 */

import { generateText } from "@/lib/ai/provider";
import { generateIonosImage } from "@/lib/ai/ionos-images";
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
  pickMotivationAngle,
  type MotivationAngle,
} from "@/lib/social/motivation";
import type { SocialChannel, SocialChannelCraft } from "@/lib/social/types";

/** Resolves Gemini model for social captions and FLUX scene briefs (`social-default`). */
async function resolveSocialTextModel(): Promise<AiModelConfig> {
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

export async function generateSocialCaption(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  postDate: string;
  dayIndex: number;
  daysInMonth: number;
}): Promise<{ caption: string; angle: MotivationAngle }> {
  const model = await resolveSocialTextModel();
  const angle = pickMotivationAngle(input.postDate);
  const prompt = buildCraftCaptionPrompt({ ...input, angle });
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
}): Promise<{ caption: string; angle: MotivationAngle }> {
  const model = await resolveSocialTextModel();
  const angle = pickMotivationAngle(input.postDate);
  const prompt = buildCraftRefinePrompt({ ...input, angle });
  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  return { caption: text.trim(), angle };
}

/**
 * Gemini invents a lively visual scene from the caption (brand image prompt = style),
 * then FLUX.2 renders that scene at 1024².
 */
export async function generateSocialImage(input: {
  imagePromptTemplate: string;
  caption: string;
  channel: SocialChannel;
  postDate: string;
  extraInstruction?: string;
}): Promise<{
  dataUrl: string;
  promptUsed: string;
  sceneDescription: string;
}> {
  const model = await resolveSocialTextModel();
  const angle = pickMotivationAngle(input.postDate);
  const plan = buildSocialImageScenePlanPrompt({
    ...input,
    sceneHint: angle.sceneHint,
  });
  const sceneRaw = await generateText({
    model,
    systemInstruction: plan.systemInstruction,
    userText: plan.userText,
  });
  const sceneDescription = sceneRaw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!sceneDescription) {
    throw new Error("Gemini hat keine Bildszene geliefert.");
  }

  const promptUsed = buildSocialFluxPromptFromScene({
    sceneDescription,
    imagePromptTemplate: input.imagePromptTemplate,
    postDate: input.postDate,
    extraInstruction: input.extraInstruction,
  });

  const result = await generateIonosImage({
    prompt: promptUsed,
    size: "1024x1024",
    outputFormat: "jpeg",
  });

  return { dataUrl: result.dataUrl, promptUsed, sceneDescription };
}
