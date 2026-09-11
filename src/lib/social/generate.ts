/**
 * Social Media caption (text model) + image (scene plan → pixels, or fixed Frage bg).
 * Branches on `postKind`: Winkel | marketing | frage.
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
  buildFrageCaptionPrompt,
  buildFrageQuestionPrompt,
  buildMarketingCaptionPrompt,
  buildMarketingRefinePrompt,
  buildSocialFluxPromptFromScene,
  buildSocialImageScenePlanPrompt,
} from "@/lib/social/craft-prompt";
import { isFrageAngleId } from "@/lib/social/frage";
import {
  getMarketingTopicByAngleId,
  type MarketingTopic,
} from "@/lib/social/marketing-features";
import {
  getMotivationAngleById,
  pickMotivationAngle,
  type MotivationAngle,
} from "@/lib/social/motivation";
import {
  composeFrageImage,
  overlayExactAngleTextOnImage,
} from "@/lib/social/overlay-angle-text";
import type {
  SocialChannel,
  SocialChannelCraft,
  SocialPostKind,
} from "@/lib/social/types";

export type SocialTopicRef = {
  id: string;
  title: string;
  sceneHint: string;
  postKind: SocialPostKind;
  angle?: MotivationAngle;
  marketing?: MarketingTopic;
};

function resolveTopic(
  postKind: SocialPostKind,
  angleId: string | undefined,
  postDate: string,
  frageQuestion?: string,
): SocialTopicRef {
  if (postKind === "marketing") {
    if (!angleId) {
      throw new Error("Marketing-Thema (Funktionen) fehlt.");
    }
    const marketing = getMarketingTopicByAngleId(angleId);
    if (!marketing) {
      throw new Error(`Unbekanntes Marketing-Thema „${angleId}“.`);
    }
    return {
      id: marketing.id,
      title: marketing.title,
      sceneHint: marketing.sceneHint,
      postKind: "marketing",
      marketing,
    };
  }

  if (postKind === "frage") {
    if (!angleId || !isFrageAngleId(angleId)) {
      throw new Error("Frage-Beitrag braucht eine gültige Frage-ID.");
    }
    const question = frageQuestion?.trim() ?? "";
    return {
      id: angleId,
      title: question || "Frage",
      sceneHint: "",
      postKind: "frage",
    };
  }

  const angle = angleId
    ? getMotivationAngleById(angleId)
    : pickMotivationAngle(postDate);
  if (!angle) {
    throw new Error(
      angleId
        ? `Unbekannter Winkel „${angleId}“.`
        : "Kein Winkel verfügbar.",
    );
  }
  return {
    id: angle.id,
    title: angle.title,
    sceneHint: angle.sceneHint,
    postKind: "winkel",
    angle,
  };
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
  postKind?: SocialPostKind;
  /** Required for `frage` — the overlay question to answer. */
  frageQuestion?: string;
}): Promise<{ caption: string; topic: SocialTopicRef }> {
  const model = await resolveSocialTextModel();
  const postKind = input.postKind ?? "winkel";
  const topic = resolveTopic(
    postKind,
    input.angleId,
    input.postDate,
    input.frageQuestion,
  );
  const { dayIndex, daysInMonth } = dayMeta(input.postDate);

  let prompt: { systemInstruction: string; userText: string };
  if (topic.postKind === "marketing" && topic.marketing) {
    prompt = buildMarketingCaptionPrompt({
      storyline: input.storyline,
      channel: input.channel,
      postDate: input.postDate,
      dayIndex,
      daysInMonth,
      topic: topic.marketing,
    });
  } else if (topic.postKind === "frage") {
    const question = input.frageQuestion?.trim() ?? "";
    if (!question) {
      throw new Error("Frage fehlt — zuerst Frage erzeugen.");
    }
    prompt = buildFrageCaptionPrompt({
      storyline: input.storyline,
      channel: input.channel,
      postDate: input.postDate,
      dayIndex,
      daysInMonth,
      question,
    });
  } else {
    prompt = buildCraftCaptionPrompt({
      storyline: input.storyline,
      craft: input.craft,
      channel: input.channel,
      postDate: input.postDate,
      dayIndex,
      daysInMonth,
      angle: topic.angle!,
    });
  }

  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  return { caption: text.trim(), topic };
}

/** Generates the Frage overlay question (before caption). */
export async function generateSocialFrageQuestion(input: {
  storyline: string;
  postDate: string;
}): Promise<{ question: string }> {
  const model = await resolveSocialTextModel();
  const { dayIndex, daysInMonth } = dayMeta(input.postDate);
  const prompt = buildFrageQuestionPrompt({
    storyline: input.storyline,
    postDate: input.postDate,
    dayIndex,
    daysInMonth,
  });
  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  const question = text
    .trim()
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .trim();
  if (!question) {
    throw new Error("Textmodell hat keine Frage geliefert.");
  }
  return { question };
}

export async function refineSocialCaption(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  currentCaption: string;
  refineInstruction: string;
  postDate: string;
  angleId?: string | null;
  postKind?: SocialPostKind;
  frageQuestion?: string;
}): Promise<{ caption: string; topic: SocialTopicRef }> {
  const model = await resolveSocialTextModel();
  const postKind = input.postKind ?? "winkel";
  const topic = resolveTopic(
    postKind,
    input.angleId ?? undefined,
    input.postDate,
    input.frageQuestion,
  );

  if (topic.postKind === "frage") {
    const question = input.frageQuestion?.trim() ?? topic.title;
    const { dayIndex, daysInMonth } = dayMeta(input.postDate);
    const prompt = buildFrageCaptionPrompt({
      storyline: input.storyline,
      channel: input.channel,
      postDate: input.postDate,
      dayIndex,
      daysInMonth,
      question,
    });
    const text = await generateText({
      model,
      systemInstruction: `${prompt.systemInstruction}

# Überarbeitung
${input.refineInstruction.trim()}
Bisheriger Text:
${input.currentCaption.trim()}`,
      userText: prompt.userText,
    });
    return { caption: text.trim(), topic };
  }

  const prompt =
    topic.postKind === "marketing"
      ? buildMarketingRefinePrompt({
          storyline: input.storyline,
          channel: input.channel,
          currentCaption: input.currentCaption,
          refineInstruction: input.refineInstruction,
          topic: topic.marketing,
        })
      : buildCraftRefinePrompt({ ...input, angle: topic.angle });

  const text = await generateText({
    model,
    systemInstruction: prompt.systemInstruction,
    userText: prompt.userText,
  });
  return { caption: text.trim(), topic };
}

/**
 * Image pipeline: AI scene (Winkel/Marketing) or fixed bg3 composite (Frage).
 */
export async function generateSocialImage(input: {
  imagePromptTemplate: string;
  caption: string;
  channel: SocialChannel;
  postDate: string;
  angleId: string;
  postKind?: SocialPostKind;
  extraInstruction?: string;
  /** Required for `frage` — painted onto bg3.jpg. */
  frageQuestion?: string;
}): Promise<{
  dataUrl: string;
  promptUsed: string;
  sceneDescription: string;
  topic: SocialTopicRef;
}> {
  const postKind = input.postKind ?? "winkel";
  const topic = resolveTopic(
    postKind,
    input.angleId,
    input.postDate,
    input.frageQuestion,
  );

  if (topic.postKind === "frage") {
    const question = input.frageQuestion?.trim() ?? "";
    if (!question) {
      throw new Error("Frage fehlt — zuerst Frage erzeugen.");
    }
    const dataUrl = await composeFrageImage(question);
    return {
      dataUrl,
      promptUsed: "fixed:public/bg3.jpg + frage overlay",
      sceneDescription: question,
      topic: { ...topic, title: question },
    };
  }

  const [textModel, imagesModel] = await Promise.all([
    resolveSocialTextModel(),
    resolveSocialImagesModel(),
  ]);
  const visualMode = topic.postKind === "marketing" ? "marketing" : "winkel";

  const plan = buildSocialImageScenePlanPrompt({
    ...input,
    sceneHint: topic.sceneHint,
    visualMode,
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
    visualMode,
  });

  const marketing = visualMode === "marketing";
  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    sizePx: marketing ? 1024 : 2048,
    outputFormat: "png",
  });

  const dataUrl = await overlayExactAngleTextOnImage({
    imageDataUrl: result.dataUrl,
    overlayText: topic.title,
    style: marketing ? "marketing" : "winkel",
  });

  return { dataUrl, promptUsed, sceneDescription, topic };
}
