/**
 * Loads and updates AI model + prompt-template settings from the `leseno` schema.
 * Public pages can later read these through the anon client; admin writes use the service role.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FALLBACK_PROMPT_ADMIN_CATALOG,
  type AiModelConfig,
  type PromptAdminCatalog,
  type PromptTemplateConfig,
} from "@/lib/prompts/catalog";

type ModelRow = {
  id: string;
  label: string;
  provider: string;
  model_slug: string;
  supports_system_prompt: boolean;
  supports_json_output: boolean;
  is_active: boolean;
  notes: string | null;
};

type PromptRow = {
  id: string;
  key: string;
  label: string;
  purpose: string;
  stage_order: number;
  model_id: string | null;
  system_template: string;
  user_template: string;
  placeholders: unknown;
  assembly_notes: string | null;
  output_contract: string | null;
};

function toPromptAdminCatalog(
  models: ModelRow[],
  prompts: PromptRow[],
): PromptAdminCatalog {
  return {
    models: models.map(
      (model): AiModelConfig => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        modelSlug: model.model_slug,
        supportsSystemPrompt: model.supports_system_prompt,
        supportsJsonOutput: model.supports_json_output,
        isActive: model.is_active,
        notes: model.notes,
      }),
    ),
    prompts: [...prompts]
      .sort((a, b) => a.stage_order - b.stage_order)
      .map(
        (prompt): PromptTemplateConfig => ({
          id: prompt.id,
          key: prompt.key,
          label: prompt.label,
          purpose: prompt.purpose,
          stageOrder: prompt.stage_order,
          modelId: prompt.model_id,
          systemTemplate: prompt.system_template,
          userTemplate: prompt.user_template,
          placeholders: Array.isArray(prompt.placeholders)
            ? prompt.placeholders.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          assemblyNotes: prompt.assembly_notes,
          outputContract: prompt.output_contract,
        }),
      ),
  };
}

function mergeWithFallback(catalog: PromptAdminCatalog): PromptAdminCatalog {
  const modelIds = new Set(catalog.models.map((model) => model.id));
  const models = [
    ...catalog.models,
    ...FALLBACK_AI_MODELS.filter((model) => !modelIds.has(model.id)),
  ];

  const promptKeys = new Set(catalog.prompts.map((prompt) => prompt.key));
  const prompts = [
    ...catalog.prompts,
    ...FALLBACK_PROMPT_TEMPLATES.filter((prompt) => !promptKeys.has(prompt.key)),
  ].sort((a, b) => a.stageOrder - b.stageOrder);

  return { models, prompts };
}

/**
 * Loads models/prompts from DB. For the story pipeline, pass `mergeFallback`
 * so missing illustration/layout stages still resolve before the migration runs.
 */
export async function loadPromptAdminCatalog(options?: {
  mergeFallback?: boolean;
}): Promise<PromptAdminCatalog> {
  const supabase = await createClient(null);
  const [modelsResult, promptsResult] = await Promise.all([
    supabase.rpc("list_ai_models"),
    supabase.rpc("list_prompt_templates"),
  ]);

  if (modelsResult.error) {
    throw new Error(modelsResult.error.message);
  }
  if (promptsResult.error) {
    throw new Error(promptsResult.error.message);
  }

  const catalog = toPromptAdminCatalog(
    modelsResult.data ?? [],
    promptsResult.data ?? [],
  );

  if (!catalog.models.length || !catalog.prompts.length) {
    return FALLBACK_PROMPT_ADMIN_CATALOG;
  }

  return options?.mergeFallback ? mergeWithFallback(catalog) : catalog;
}

export async function updatePromptAdminCatalog(
  models: AiModelConfig[],
  prompts: PromptTemplateConfig[],
): Promise<void> {
  await updateAiModels(models);
  await updatePromptTemplates(prompts);
}

export async function updateAiModels(models: AiModelConfig[]): Promise<void> {
  const supabase = createServiceClient(null);

  for (const model of models) {
    const { error } = await supabase.rpc("update_ai_model", {
      p_id: model.id,
      p_label: model.label,
      p_provider: model.provider,
      p_model_slug: model.modelSlug,
      p_supports_system_prompt: model.supportsSystemPrompt,
      p_supports_json_output: model.supportsJsonOutput,
      p_is_active: model.isActive,
      p_notes: model.notes,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function updatePromptTemplates(
  prompts: PromptTemplateConfig[],
): Promise<void> {
  const supabase = createServiceClient(null);

  for (const prompt of prompts) {
    const { error } = await supabase.rpc("update_prompt_template", {
      p_id: prompt.id,
      p_label: prompt.label,
      p_purpose: prompt.purpose,
      p_model_id: prompt.modelId,
      p_system_template: prompt.systemTemplate,
      p_user_template: prompt.userTemplate,
      p_placeholders: prompt.placeholders,
      p_assembly_notes: prompt.assemblyNotes,
      p_output_contract: prompt.outputContract,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}
