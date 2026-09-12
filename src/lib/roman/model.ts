/**
 * Resolves the text model for the novel pipeline (Gemini preferred).
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { FALLBACK_AI_MODELS } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";

/** Prefer active story-default Gemini; fall back to catalog defaults. */
export async function resolveRomanTextModel(): Promise<AiModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const fromDb = catalog.models.find(
      (m) =>
        m.isActive &&
        m.provider.trim().toLowerCase() === "gemini" &&
        (m.id === "story-default" ||
          m.id === "facts-default" ||
          m.id === "social-default"),
    );
    if (fromDb) return fromDb;
    const anyGemini = catalog.models.find(
      (m) => m.isActive && m.provider.trim().toLowerCase() === "gemini",
    );
    if (anyGemini) return anyGemini;
  } catch {
    // use fallback
  }

  return (
    FALLBACK_AI_MODELS.find((m) => m.id === "story-default") ??
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
