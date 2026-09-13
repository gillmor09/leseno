/**
 * Resolves the text model for the novel pipeline (Gemini preferred).
 * Schreibmodell dropdown uses wired text LLMs by slug — not catalog roles.
 */

import {
  WIRED_AI_ENDPOINTS,
  findWiredAiEndpoint,
  isTextLlmProvider,
  type WiredAiEndpoint,
} from "@/lib/ai/wired-models";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { FALLBACK_AI_MODELS } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";

function isActiveTextLlm(model: AiModelConfig): boolean {
  return model.isActive && isTextLlmProvider(model.provider);
}

/** Synthetic catalog row for a wired text endpoint (`id` = modelSlug). */
function wiredTextLlmToConfig(endpoint: WiredAiEndpoint): AiModelConfig {
  return {
    id: endpoint.modelSlug,
    label: endpoint.label,
    provider: endpoint.provider,
    modelSlug: endpoint.modelSlug,
    supportsSystemPrompt: true,
    supportsJsonOutput: false,
    isActive: true,
    notes: null,
    ttsVoiceId: null,
  };
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
 * Wired text LLMs for Phase 1–3 (dropdown shows Gemini / Claude / IONOS, not roles).
 */
export async function listRomanSchreibModels(): Promise<AiModelConfig[]> {
  return WIRED_AI_ENDPOINTS.filter((endpoint) =>
    isTextLlmProvider(endpoint.provider),
  ).map(wiredTextLlmToConfig);
}

/** Default Schreibmodell: story-default’s wired slug, else first Gemini text LLM. */
export async function resolveDefaultRomanSchreibModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const story = catalog.models.find((m) => m.id === "story-default");
    const wired = story ? findWiredAiEndpoint(story.modelSlug) : undefined;
    if (wired && isTextLlmProvider(wired.provider)) {
      return wiredTextLlmToConfig(wired);
    }
  } catch {
    // fall through
  }
  const list = await listRomanSchreibModels();
  return (
    list.find((m) => m.provider === "gemini") ??
    list[0] ??
    wiredTextLlmToConfig(
      WIRED_AI_ENDPOINTS.find((e) => isTextLlmProvider(e.provider))!,
    )
  );
}

/**
 * Resolves the LLM for author / lektor / fan / revision / summary.
 * `modelId` is a wired text `modelSlug` (legacy catalog role ids still map).
 */
export async function resolveRomanSchreibModel(
  modelId?: string | null,
): Promise<AiModelConfig> {
  const wanted = modelId?.trim();
  if (wanted) {
    const direct = findWiredAiEndpoint(wanted);
    if (direct && isTextLlmProvider(direct.provider)) {
      return wiredTextLlmToConfig(direct);
    }

    // Legacy session values: facts-default / story-default → that role’s slug
    try {
      const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
      const role = catalog.models.find(
        (m) => m.id === wanted && isActiveTextLlm(m),
      );
      const fromRole = role
        ? findWiredAiEndpoint(role.modelSlug)
        : undefined;
      if (fromRole && isTextLlmProvider(fromRole.provider)) {
        return wiredTextLlmToConfig(fromRole);
      }
    } catch {
      const fallback = FALLBACK_AI_MODELS.find(
        (m) => m.id === wanted && isActiveTextLlm(m),
      );
      const fromFallback = fallback
        ? findWiredAiEndpoint(fallback.modelSlug)
        : undefined;
      if (fromFallback && isTextLlmProvider(fromFallback.provider)) {
        return wiredTextLlmToConfig(fromFallback);
      }
    }

    throw new Error(
      `Schreibmodell „${wanted}“ ist kein angebundenes Text-LLM.`,
    );
  }
  return resolveDefaultRomanSchreibModel();
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
