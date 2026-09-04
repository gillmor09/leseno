/**
 * Fact „Warum?“ / „mehr wissen“ explanations via prompt catalog + gpt-oss-120b.
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
import { ageGroupForSchoolStage } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import { UserFacingError } from "@/lib/errors/user-facing";

export type FactWhyInput = {
  fact: string;
  schoolStage: StorySchoolStageId;
  mood: StoryMoodId;
};

export type FactWhyMoreInput = FactWhyInput & {
  background: string;
};

async function loadCatalog(): Promise<PromptAdminCatalog> {
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
    throw new UserFacingError(
      `Prompt-Vorlage „${key}“ fehlt. Bitte in der Verwaltung anlegen.`,
    );
  }
  return template;
}

function resolveModel(
  catalog: PromptAdminCatalog,
  modelId: string | null,
  label: string,
): AiModelConfig {
  if (!modelId) {
    throw new UserFacingError(`Für „${label}“ ist kein KI-Modell hinterlegt.`);
  }
  const model = catalog.models.find((entry) => entry.id === modelId);
  if (!model) {
    throw new UserFacingError(
      `Das Modell „${modelId}“ für „${label}“ wurde nicht gefunden.`,
    );
  }
  return model;
}

/** Human-readable age band for prompts (`5–7 Jahre` / `8–10 Jahre`). */
export function ageGroupLabelForSchoolStage(
  stage: StorySchoolStageId,
): string {
  return ageGroupForSchoolStage(stage) === "5-7"
    ? "ca. 5–7 Jahre"
    : "ca. 8–10 Jahre";
}

function schoolStageLabel(stage: StorySchoolStageId): string {
  return (
    STORY_SCHOOL_STAGES.find((entry) => entry.id === stage)?.label ?? stage
  );
}

function moodLabel(mood: StoryMoodId): string {
  return STORY_MOODS.find((entry) => entry.id === mood)?.label ?? mood;
}

function commonPlaceholders(input: FactWhyInput): Record<string, string> {
  return {
    age_group: ageGroupLabelForSchoolStage(input.schoolStage),
    school_stage: schoolStageLabel(input.schoolStage),
    story_mood: moodLabel(input.mood),
    fact: input.fact.trim(),
  };
}

async function runFactPrompt(options: {
  promptKey: string;
  values: Record<string, string>;
}): Promise<string> {
  const catalog = await loadCatalog();
  const template = requireTemplate(catalog, options.promptKey);
  const model = resolveModel(catalog, template.modelId, template.label);

  const systemInstruction = fillPromptTemplate(
    template.systemTemplate,
    options.values,
  );
  const userText = fillPromptTemplate(template.userTemplate, options.values);

  const text = await generateText({
    model,
    systemInstruction,
    userText,
  });

  const cleaned = text.trim();
  if (!cleaned) {
    throw new UserFacingError("Die Erklärung ist leer geblieben. Bitte nochmal versuchen.");
  }
  return cleaned;
}

/**
 * First-pass background for a single learned fact.
 */
export async function explainFactWhy(input: FactWhyInput): Promise<string> {
  return runFactPrompt({
    promptKey: "fact-why",
    values: commonPlaceholders(input),
  });
}

/**
 * Deeper follow-up using fact + previous background as context.
 */
export async function explainFactWhyMore(
  input: FactWhyMoreInput,
): Promise<string> {
  return runFactPrompt({
    promptKey: "fact-why-more",
    values: {
      ...commonPlaceholders(input),
      background: input.background.trim(),
    },
  });
}
