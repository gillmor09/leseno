/**
 * Two-stage story pipeline: research facts, then write the story.
 * Models and prompt templates come from the admin catalog (DB with fallback).
 */

import { fillPromptTemplate } from "@/lib/ai/assemble";
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
  formatWordRange,
  type StoryLengthCatalog,
  type StoryLengthStepId,
  STORY_LENGTH_STEPS,
} from "@/lib/stories/length";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";

export type StoryGenerateInput = {
  topic: string;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
};

export type StoryGenerateResult = {
  story: string;
  facts: string[];
  factCount: number;
  wordRange: string;
  factsModelId: string;
  storyModelId: string;
};

async function loadPromptCatalogSafe(): Promise<PromptAdminCatalog> {
  try {
    return await loadPromptAdminCatalog();
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

function labelForSchoolStage(stage: StorySchoolStageId): string {
  return (
    STORY_SCHOOL_STAGES.find((entry) => entry.id === stage)?.label ?? stage
  );
}

function labelForMood(mood: StoryMoodId): string {
  return STORY_MOODS.find((entry) => entry.id === mood)?.label ?? mood;
}

function labelForLengthStep(stepId: StoryLengthStepId): string {
  return (
    STORY_LENGTH_STEPS.find((entry) => entry.id === stepId)?.label ?? stepId
  );
}

/**
 * Parses fact lists from JSON arrays or numbered / bullet lines.
 */
function factItemToString(item: unknown): string {
  if (typeof item === "string") {
    return item.trim();
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
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function parseFactsFromModelText(raw: string, expectedCount: number): string[] {
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map(factItemToString)
        .filter(Boolean)
        .slice(0, expectedCount);
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { facts?: unknown }).facts)
    ) {
      return ((parsed as { facts: unknown[] }).facts as unknown[])
        .map(factItemToString)
        .filter(Boolean)
        .slice(0, expectedCount);
    }
  } catch {
    // Fall through to line parsing.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-–—*•\d.)]+/, "").trim())
    .filter((line) => line.length > 8 && !line.includes("[object Object]"));

  if (lines.length > 0) {
    return lines.slice(0, expectedCount);
  }

  return [trimmed].filter((line) => line && !line.includes("[object Object]")).slice(0, expectedCount);
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
  const wordRange = formatWordRange(limit);
  return { factCount, wordRange };
}

/**
 * Runs facts-research then story-write using admin-configured models/prompts.
 */
export async function generateStoryPipeline(
  input: StoryGenerateInput,
): Promise<StoryGenerateResult> {
  const [lengthCatalog, promptCatalog] = await Promise.all([
    loadStoryLengthCatalog(),
    loadPromptCatalogSafe(),
  ]);

  const { factCount, wordRange } = resolveLengthContext(lengthCatalog, input);

  const factsTemplate = requireTemplate(promptCatalog, "facts-research");
  const storyTemplate = requireTemplate(promptCatalog, "story-write");
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
    story_mood: labelForMood(input.mood),
    length_step: labelForLengthStep(input.lengthStep),
    fact_count: factCount,
    target_word_range: wordRange,
  };

  const factsUser = fillPromptTemplate(factsTemplate.userTemplate, sharedValues);
  const factsSystem = fillPromptTemplate(
    factsTemplate.systemTemplate,
    sharedValues,
  );

  const factsRaw = await generateText({
    model: factsModel,
    systemInstruction: factsSystem,
    userText: factsUser,
    preferJson: true,
  });

  const facts = parseFactsFromModelText(factsRaw, factCount);
  if (facts.length === 0) {
    throw new Error("Es konnten keine Fakten ermittelt werden.");
  }

  const storyValues = {
    ...sharedValues,
    facts_block: buildFactsBlock(facts),
  };
  const storyUser = fillPromptTemplate(storyTemplate.userTemplate, storyValues);
  const storySystem = fillPromptTemplate(
    storyTemplate.systemTemplate,
    storyValues,
  );

  const story = await generateText({
    model: storyModel,
    systemInstruction: storySystem,
    userText: storyUser,
    preferJson: false,
  });

  return {
    story: story.trim(),
    facts,
    factCount,
    wordRange,
    factsModelId: factsModel.id,
    storyModelId: storyModel.id,
  };
}
