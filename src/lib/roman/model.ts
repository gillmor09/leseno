/**
 * Resolves the text model for the novel pipeline (Gemini preferred).
 */

import { isTextLlmProvider } from "@/lib/ai/wired-models";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { FALLBACK_AI_MODELS } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";

function isActiveTextLlm(model: AiModelConfig): boolean {
  return model.isActive && isTextLlmProvider(model.provider);
}

/** Prefer active story-default Gemini; fall back to catalog defaults. */
export async function resolveRomanTextModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const fromDb = catalog.models.find(
      (m) =>
        isActiveTextLlm(m) &&
        m.provider.trim().toLowerCase() === "gemini" &&
        (m.id === "story-default" ||
          m.id === "facts-default" ||
          m.id === "social-default"),
    );
    if (fromDb) return fromDb;
    const anyGemini = catalog.models.find(
      (m) =>
        isActiveTextLlm(m) && m.provider.trim().toLowerCase() === "gemini",
    );
    if (anyGemini) return anyGemini;
    const anyLlm = catalog.models.find(isActiveTextLlm);
    if (anyLlm) return anyLlm;
  } catch {
    // use fallback
  }

  return (
    FALLBACK_AI_MODELS.find((m) => m.id === "story-default") ??
    FALLBACK_AI_MODELS.find(isActiveTextLlm) ??
    FALLBACK_AI_MODELS[0]!
  );
}

/**
 * Active text LLMs for Phase 1–3 scene writing (admin dropdown).
 */
export async function listRomanSchreibModels(): Promise<AiModelConfig[]> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const fromDb = catalog.models.filter(isActiveTextLlm);
    if (fromDb.length) {
      return [...fromDb].sort((a, b) => a.label.localeCompare(b.label, "de"));
    }
  } catch {
    // use fallback
  }
  return FALLBACK_AI_MODELS.filter(isActiveTextLlm);
}

/**
 * Resolves the LLM used for author / lektor / fan / revision / summary.
 * `modelId` must be an active text LLM from the catalog.
 */
export async function resolveRomanSchreibModel(
  modelId?: string | null,
): Promise<AiModelConfig> {
  const wanted = modelId?.trim();
  if (wanted) {
    try {
      const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
      const found = catalog.models.find(
        (m) => m.id === wanted && isActiveTextLlm(m),
      );
      if (found) return found;
    } catch {
      const fallback = FALLBACK_AI_MODELS.find(
        (m) => m.id === wanted && isActiveTextLlm(m),
      );
      if (fallback) return fallback;
    }
    throw new Error(
      `Schreibmodell „${wanted}“ fehlt, ist inaktiv oder kein Text-LLM.`,
    );
  }
  return resolveRomanTextModel();
}

/**
 * Gemini Flash for the Ideen-Finder chat (fast ideation).
 * Prefers flash-slug models from the catalog.
 */
export async function resolveRomanIdeaChatModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const flash = catalog.models.find(
      (m) =>
        m.isActive &&
        m.provider.trim().toLowerCase() === "gemini" &&
        m.modelSlug.toLowerCase().includes("flash"),
    );
    if (flash) return flash;
  } catch {
    // use shared roman text model
  }
  return resolveRomanTextModel();
}

/**
 * Mistral (IONOS openai-compatible) to map chat → foundation fields 1–4.
 */
export async function resolveRomanIdeaFillModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const mistral = catalog.models.find(
      (m) =>
        m.isActive &&
        m.provider.trim().toLowerCase() === "openai-compatible" &&
        m.modelSlug.toLowerCase().includes("mistral"),
    );
    if (mistral) return mistral;
    const layout = catalog.models.find(
      (m) => m.isActive && m.id === "layout-default",
    );
    if (layout) return layout;
  } catch {
    // use fallback
  }
  return (
    FALLBACK_AI_MODELS.find((m) => m.id === "layout-default") ??
    FALLBACK_AI_MODELS.find((m) =>
      m.modelSlug.toLowerCase().includes("mistral"),
    ) ??
    FALLBACK_AI_MODELS[0]!
  );
}

/** Pixel model for roman cover (same catalog row as story/social illustrations). */
export async function resolveRomanImagesModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const model = catalog.models.find((m) => m.id === "images-default");
    if (model?.isActive) return model;
  } catch {
    // use fallback
  }
  const fallback = FALLBACK_AI_MODELS.find((m) => m.id === "images-default");
  if (!fallback) {
    throw new Error("Illustrationsmodell (images-default) fehlt im Katalog.");
  }
  return fallback;
}
