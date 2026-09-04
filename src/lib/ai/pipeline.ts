/**
 * Story pipeline: facts → story (+ optional FLUX ∥ story) → optional layout.
 */

import { fillPromptTemplate } from "@/lib/ai/assemble";
import {
  buildFluxIllustrationPlans,
  illustrationCountForWordTarget,
  type FluxIllustrationPlan,
} from "@/lib/ai/flux-illustrations";
import { generateIonosImage } from "@/lib/ai/ionos-images";
import { getIonosImageModelSlug } from "@/lib/ai/ionos";
import { generateText } from "@/lib/ai/provider";
import {
  FALLBACK_PROMPT_ADMIN_CATALOG,
  type AiModelConfig,
  type PromptAdminCatalog,
  type PromptTemplateConfig,
} from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import {
  findLengthLimit,
  formatWordTarget,
  type StoryLengthCatalog,
  type StoryLengthStepId,
  STORY_LENGTH_STEPS,
} from "@/lib/stories/length";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import {
  promptValueForMood,
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import type { PersonalStoryContext } from "@/lib/stories/personal";
import { buildPersonalPromptBlock } from "@/lib/stories/personal";
import { buildSyllableHelpPromptBlock, applySyllableHelpMarkup } from "@/lib/stories/syllable-help";
import { sanitizeStoryHtml } from "@/lib/stories/sanitize-story-html";
import { UserFacingError } from "@/lib/errors/user-facing";

export type StoryGenerateInput = {
  topic: string;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  /** Set when "Ganz persönlich" is active (Meine Welt). */
  personal?: PersonalStoryContext | null;
  /** Erstlese two-color syllable markup in story HTML. */
  syllableHelp?: boolean;
  /** When false, skip FLUX pixels and Mistral layout (story HTML only). */
  includeImages?: boolean;
};

export type StoryGenerateResult = {
  story: string;
  facts: string[];
  factCount: number;
  wordRange: string;
  factsModelId: string;
  storyModelId: string;
  imagesModelId: string;
  layoutModelId: string;
  imageCount: number;
};

type GeneratedIllustration = FluxIllustrationPlan & {
  dataUrl: string;
};

async function loadPromptCatalogSafe(): Promise<PromptAdminCatalog> {
  try {
    return await loadPromptAdminCatalog({ mergeFallback: true });
  } catch {
    return FALLBACK_PROMPT_ADMIN_CATALOG;
  }
}

function requireTemplate(
  catalog: PromptAdminCatalog,
  key: string,
): PromptTemplateConfig {
  const template = catalog.prompts.find((prompt) => prompt.key === key);
  if (!template) {
    throw new Error(`Prompt-Vorlage „${key}“ fehlt in der Verwaltung.`);
  }
  return template;
}

/**
 * Prefers a personal-mode template when present; otherwise falls back to the base key.
 */
function requireTemplatePrefer(
  catalog: PromptAdminCatalog,
  preferredKey: string,
  fallbackKey: string,
): PromptTemplateConfig {
  return (
    catalog.prompts.find((prompt) => prompt.key === preferredKey) ??
    requireTemplate(catalog, fallbackKey)
  );
}

function resolveModel(
  catalog: PromptAdminCatalog,
  modelId: string | null,
  stageLabel: string,
): AiModelConfig {
  if (!modelId) {
    throw new Error(`Für „${stageLabel}“ ist kein KI-Modell hinterlegt.`);
  }
  const model = catalog.models.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(
      `Das Modell „${modelId}“ für „${stageLabel}“ wurde nicht gefunden.`,
    );
  }
  return model;
}

function resolveImagesModel(catalog: PromptAdminCatalog): AiModelConfig {
  const model = catalog.models.find((entry) => entry.id === "images-default");
  if (!model) {
    throw new Error('Das Modell „images-default“ (FLUX) fehlt in der Verwaltung.');
  }
  return model;
}

function labelForSchoolStage(stage: StorySchoolStageId): string {
  return (
    STORY_SCHOOL_STAGES.find((entry) => entry.id === stage)?.label ?? stage
  );
}

function labelForMood(mood: StoryMoodId): string {
  return STORY_MOODS.find((entry) => entry.id === mood)?.label ?? mood;
}

function moodPromptValue(mood: StoryMoodId): string {
  return promptValueForMood(mood);
}

function labelForLengthStep(stepId: StoryLengthStepId): string {
  return (
    STORY_LENGTH_STEPS.find((entry) => entry.id === stepId)?.label ?? stepId
  );
}

/**
 * Parses fact lists from JSON arrays or numbered / bullet lines.
 * Strips fences and ignores JSON scaffolding so the UI only shows plain facts.
 */
function factItemToString(item: unknown): string {
  if (typeof item === "string") {
    return cleanFactText(item);
  }
  if (typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }
  if (!item || typeof item !== "object") {
    return "";
  }

  const record = item as Record<string, unknown>;
  const preferredKeys = [
    "fact",
    "fakt",
    "text",
    "content",
    "description",
    "beschreibung",
    "value",
    "statement",
    "body",
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return cleanFactText(value);
    }
  }

  // Avoid picking up ids, labels, or nested prompt leftovers.
  for (const [key, value] of Object.entries(record)) {
    if (/^(id|type|source|model|prompt|role|index)$/i.test(key)) continue;
    if (typeof value === "string" && value.trim()) {
      return cleanFactText(value);
    }
  }

  return "";
}

function cleanFactText(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^[\s\-–—*•\d.)"']+/, "")
    .replace(/["']\s*$/, "")
    .trim();
}

function looksLikeJsonNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^[{[\]},]$/.test(trimmed)) return true;
  if (/^["']?(facts|illustrations|items|data|prompt|model)["']?\s*:/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (trimmed.includes("[object Object]")) return true;
  if (/^```/.test(trimmed)) return true;
  return false;
}

function extractJsonPayload(raw: string): unknown | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    const start = stripped.search(/[\[{]/);
    const endObj = stripped.lastIndexOf("}");
    const endArr = stripped.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function factsFromParsedJson(parsed: unknown, expectedCount: number): string[] {
  if (Array.isArray(parsed)) {
    return parsed.map(factItemToString).filter(Boolean).slice(0, expectedCount);
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  for (const key of ["facts", "items", "data", "results", "fakten"]) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[])
        .map(factItemToString)
        .filter(Boolean)
        .slice(0, expectedCount);
    }
  }

  return [];
}

export function parseFactsFromModelText(
  raw: string,
  expectedCount: number,
): string[] {
  const parsed = extractJsonPayload(raw);
  if (parsed !== null) {
    const fromJson = factsFromParsedJson(parsed, expectedCount);
    if (fromJson.length > 0) {
      return fromJson;
    }
  }

  const lines = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .split(/\r?\n/)
    .map((line) => cleanFactText(line))
    .filter((line) => line.length > 8 && !looksLikeJsonNoise(line));

  if (lines.length > 0) {
    return lines.slice(0, expectedCount);
  }

  const fallback = cleanFactText(raw);
  return fallback && !looksLikeJsonNoise(fallback) ? [fallback] : [];
}

function buildFactsBlock(facts: string[]): string {
  return facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n");
}

function resolveLengthContext(
  catalog: StoryLengthCatalog,
  input: StoryGenerateInput,
) {
  const limit = findLengthLimit(
    catalog,
    input.schoolStage,
    input.lengthStep,
  );
  const factCount = Math.max(1, limit?.factCount ?? 2);
  const wordRange = formatWordTarget(limit);
  const imageCount = illustrationCountForWordTarget(
    limit?.anzahlWoerter ?? 0,
  );
  return { factCount, wordRange, imageCount };
}

function stripCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildImagesManifest(images: GeneratedIllustration[]): string {
  return images
    .map((image) => {
      const hint = image.placementHint
        ? ` | Platzierung: ${image.placementHint}`
        : "";
      return `- id=${image.id} | alt=${image.alt}${hint} | class="story-illustration ${image.floatClass}" | src=__ILL_${image.id}__ | width=256 height=256`;
    })
    .join("\n");
}

/**
 * Replaces `__ILL_<id>__` placeholders with data URLs after layout.
 */
export function resolveIllustrationPlaceholders(
  html: string,
  images: GeneratedIllustration[],
): string {
  let result = stripCodeFence(html);
  for (const image of images) {
    const token = `__ILL_${image.id}__`;
    result = result.split(token).join(image.dataUrl);
  }
  return result;
}

async function generateIllustrationPixels(
  plans: FluxIllustrationPlan[],
  modelSlug: string,
): Promise<GeneratedIllustration[]> {
  // Max 3 images — run in parallel (bounded by plan count).
  return Promise.all(
    plans.map(async (plan) => {
      const image = await generateIonosImage({
        prompt: plan.imagePrompt,
        size: "256x256",
        modelSlug,
        outputFormat: "png",
      });
      return {
        ...plan,
        dataUrl: image.dataUrl,
      };
    }),
  );
}

/**
 * Runs facts, then story (+ optional FLUX images ∥ story), then optional layout.
 * `includeImages: true` enables illustration generation and Mistral embedding.
 * Default / omitted is text-only.
 */
export async function generateStoryPipeline(
  input: StoryGenerateInput,
): Promise<StoryGenerateResult> {
  const [lengthCatalog, promptCatalog] = await Promise.all([
    loadStoryLengthCatalog(),
    loadPromptCatalogSafe(),
  ]);

  const includeImages = input.includeImages === true;

  const { factCount, wordRange, imageCount } = resolveLengthContext(
    lengthCatalog,
    input,
  );

  const isPersonal = Boolean(input.personal);
  const factsTemplate = isPersonal
    ? requireTemplatePrefer(
        promptCatalog,
        "facts-research-personal",
        "facts-research",
      )
    : requireTemplate(promptCatalog, "facts-research");
  const storyTemplate = isPersonal
    ? requireTemplatePrefer(
        promptCatalog,
        "story-write-personal",
        "story-write",
      )
    : requireTemplate(promptCatalog, "story-write");

  const factsModel = resolveModel(
    promptCatalog,
    factsTemplate.modelId,
    factsTemplate.label,
  );
  const storyModel = resolveModel(
    promptCatalog,
    storyTemplate.modelId,
    storyTemplate.label,
  );

  const sharedValues = {
    topic: input.topic,
    school_stage: labelForSchoolStage(input.schoolStage),
    story_mood: moodPromptValue(input.mood),
    length_step: labelForLengthStep(input.lengthStep),
    fact_count: factCount,
    target_word_count: wordRange,
    personal_block: input.personal
      ? buildPersonalPromptBlock(input.personal)
      : "",
    protagonist_name: input.personal?.protagonistName ?? "",
    friends_list:
      input.personal?.friendNames.join(", ") ?? "",
    syllable_help_block: buildSyllableHelpPromptBlock(
      Boolean(input.syllableHelp),
    ),
  };

  const factsRaw = await generateText({
    model: factsModel,
    systemInstruction: fillPromptTemplate(
      factsTemplate.systemTemplate,
      sharedValues,
    ),
    userText: fillPromptTemplate(factsTemplate.userTemplate, sharedValues),
    preferJson: true,
  });

  const facts = parseFactsFromModelText(factsRaw, factCount);
  if (facts.length === 0) {
    throw new UserFacingError("Es konnte kein Wissen zum Thema gefunden werden.");
  }

  const factsBlock = buildFactsBlock(facts);
  const afterFactsValues = {
    ...sharedValues,
    facts_block: factsBlock,
  };

  if (!includeImages) {
    const storyHtmlRaw = stripCodeFence(
      await generateText({
        model: storyModel,
        systemInstruction: fillPromptTemplate(
          storyTemplate.systemTemplate,
          afterFactsValues,
        ),
        userText: fillPromptTemplate(
          storyTemplate.userTemplate,
          afterFactsValues,
        ),
        preferJson: false,
      }),
    );

    if (!storyHtmlRaw.trim()) {
      throw new UserFacingError("Die Geschichte kam leer zurück.");
    }

    const withSyllables = input.syllableHelp
      ? applySyllableHelpMarkup(storyHtmlRaw)
      : storyHtmlRaw;
    const story = sanitizeStoryHtml(withSyllables);
    if (!story.trim()) {
      throw new UserFacingError("Die Geschichte kam leer zurück.");
    }

    return {
      story,
      facts,
      factCount,
      wordRange,
      factsModelId: factsModel.id,
      storyModelId: storyModel.id,
      imagesModelId: "",
      layoutModelId: "",
      imageCount: 0,
    };
  }

  const layoutTemplate = requireTemplate(promptCatalog, "story-layout");
  const imagesModel = resolveImagesModel(promptCatalog);
  const layoutModel = resolveModel(
    promptCatalog,
    layoutTemplate.modelId,
    layoutTemplate.label,
  );

  const fluxPlans = buildFluxIllustrationPlans({
    topic: input.topic,
    schoolStageLabel: sharedValues.school_stage,
    moodId: input.mood,
    moodLabel: labelForMood(input.mood),
    facts,
    imageCount,
    protagonistName: input.personal?.protagonistName,
    friendNames: input.personal?.friendNames,
  });

  const fluxModelSlug =
    imagesModel.provider.trim().toLowerCase() === "ionos-image"
      ? imagesModel.modelSlug
      : getIonosImageModelSlug();

  const [storyHtmlRaw, illustrations] = await Promise.all([
    generateText({
      model: storyModel,
      systemInstruction: fillPromptTemplate(
        storyTemplate.systemTemplate,
        afterFactsValues,
      ),
      userText: fillPromptTemplate(storyTemplate.userTemplate, afterFactsValues),
      preferJson: false,
    }).then((text) => stripCodeFence(text)),
    generateIllustrationPixels(fluxPlans, fluxModelSlug),
  ]);

  if (!storyHtmlRaw.trim()) {
    throw new UserFacingError("Die Geschichte kam leer zurück.");
  }
  if (illustrations.length === 0) {
    throw new UserFacingError(
      "Es konnten keine Illustrationen erzeugt werden.",
    );
  }

  const layoutValues = {
    ...sharedValues,
    story_html: storyHtmlRaw,
    images_manifest: buildImagesManifest(illustrations),
  };

  const layoutRaw = await generateText({
    model: layoutModel,
    systemInstruction: fillPromptTemplate(
      layoutTemplate.systemTemplate,
      layoutValues,
    ),
    userText: fillPromptTemplate(layoutTemplate.userTemplate, layoutValues),
    preferJson: false,
  });

  const withImages = resolveIllustrationPlaceholders(layoutRaw, illustrations);
  const withSyllables = input.syllableHelp
    ? applySyllableHelpMarkup(withImages)
    : withImages;
  const story = sanitizeStoryHtml(withSyllables);
  if (!story.trim()) {
    throw new UserFacingError("Die Geschichte kam leer zurück.");
  }

  return {
    story,
    facts,
    factCount,
    wordRange,
    factsModelId: factsModel.id,
    storyModelId: storyModel.id,
    imagesModelId: imagesModel.id,
    layoutModelId: layoutModel.id,
    imageCount: illustrations.length,
  };
}
