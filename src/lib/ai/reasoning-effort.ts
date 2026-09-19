/**
 * Reasoning depth options per wired model family.
 * OpenAI: `reasoning_effort`. Gemini 3.x: `thinking_level` (same role column).
 * Claude / IONOS: not applicable — UI shows “nicht unterstützt”.
 */

import { findWiredAiEndpoint } from "@/lib/ai/wired-models";

export type ReasoningEffortOption = {
  value: string;
  label: string;
};

/** Sentinel: use code/provider default for the model. */
export const REASONING_EFFORT_AUTO = "";

function isOpenAiReasoningSlug(slug: string, provider: string): boolean {
  if (provider === "openai") return true;
  return (
    slug.startsWith("gpt-5") ||
    slug.startsWith("gpt-6") ||
    slug.startsWith("o1") ||
    slug.startsWith("o3") ||
    slug.startsWith("o4")
  );
}

function isGeminiTextSlug(slug: string, provider: string): boolean {
  if (provider === "gemini") return true;
  return slug.startsWith("gemini-") && !slug.includes("image") && !slug.includes("veo");
}

/**
 * Gemini 3.8 / 3.7 Flash: low|medium|high only (minimal → API error).
 * Flash-Lite / 3.5 / 3.6: also minimal.
 */
function geminiThinkingOptions(slug: string): ReasoningEffortOption[] {
  const noMinimal =
    slug.includes("3.8") ||
    slug.includes("3.7") ||
    slug.includes("3.1-pro") ||
    slug.includes("gemini-3-pro");

  const levels: ReasoningEffortOption[] = [];
  if (!noMinimal) {
    levels.push({
      value: "minimal",
      label: "minimal — kaum Thinking (schnell)",
    });
  }
  levels.push(
    { value: "low", label: "low — leicht / latenzarm" },
    { value: "medium", label: "medium — ausgewogen (Gemini-Default)" },
    { value: "high", label: "high — gründlich (Recherche / Kritik filtern)" },
  );
  return levels;
}

/**
 * Supported reasoning / thinking values for a model slug.
 * Empty = provider does not take this parameter.
 */
export function reasoningEffortOptionsForModel(
  modelSlug: string,
): ReasoningEffortOption[] {
  const slug = modelSlug.trim().toLowerCase();
  const wired = findWiredAiEndpoint(modelSlug);
  const provider = (wired?.provider ?? "").trim().toLowerCase();

  if (isGeminiTextSlug(slug, provider)) {
    return geminiThinkingOptions(slug);
  }

  if (!isOpenAiReasoningSlug(slug, provider)) {
    return [];
  }

  // GPT-5.6 Luna / Terra family (API error listed these for Luna).
  if (slug.includes("luna") || slug.includes("terra")) {
    return [
      { value: "none", label: "none — kein Reasoning (schnell)" },
      { value: "low", label: "low — leicht (Standard Volumen)" },
      { value: "medium", label: "medium — ausgewogen" },
      { value: "high", label: "high — gründlich" },
      { value: "xhigh", label: "xhigh — sehr gründlich" },
    ];
  }

  // Astra / GPT-6 and other OpenAI reasoning models — broader set.
  return [
    { value: "none", label: "none — kein Reasoning" },
    { value: "low", label: "low — leicht" },
    { value: "medium", label: "medium — ausgewogen (Default Astra)" },
    { value: "high", label: "high — gründlich" },
    { value: "xhigh", label: "xhigh — sehr gründlich" },
  ];
}

export function modelSupportsReasoningEffort(modelSlug: string): boolean {
  return reasoningEffortOptionsForModel(modelSlug).length > 0;
}

/** UI label: OpenAI vs Gemini parameter name. */
export function reasoningEffortUiLabel(modelSlug: string): string {
  const slug = modelSlug.trim().toLowerCase();
  const wired = findWiredAiEndpoint(modelSlug);
  const provider = (wired?.provider ?? "").trim().toLowerCase();
  if (isGeminiTextSlug(slug, provider)) {
    return "Thinking-Level (Gemini)";
  }
  if (isOpenAiReasoningSlug(slug, provider)) {
    return "Reasoning-Effort (OpenAI)";
  }
  return "Reasoning / Thinking";
}

/** Default when role has auto/empty. */
export function defaultReasoningEffortForModel(modelSlug: string): string | null {
  const options = reasoningEffortOptionsForModel(modelSlug);
  if (options.length === 0) return null;
  const slug = modelSlug.trim().toLowerCase();
  const wired = findWiredAiEndpoint(modelSlug);
  const provider = (wired?.provider ?? "").trim().toLowerCase();

  if (isGeminiTextSlug(slug, provider)) {
    if (slug.includes("flash-lite") || slug.includes("lite")) {
      return options.some((o) => o.value === "minimal") ? "minimal" : "low";
    }
    return "medium";
  }

  if (slug.includes("astra") || slug.includes("pro") || slug.includes("sol")) {
    return "medium";
  }
  return "low";
}

/**
 * Resolve stored role value to an API value, or null if the model ignores it.
 * Maps invalid OpenAI-only values (none/xhigh) away for Gemini.
 */
export function resolveReasoningEffort(
  modelSlug: string,
  stored: string | null | undefined,
): string | null {
  const options = reasoningEffortOptionsForModel(modelSlug);
  if (options.length === 0) return null;
  const trimmed = (stored ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "auto") {
    return defaultReasoningEffortForModel(modelSlug);
  }
  if (options.some((o) => o.value === trimmed)) {
    return trimmed;
  }
  // Soft map OpenAI → Gemini when switching models on a role.
  if (trimmed === "none" || trimmed === "xhigh") {
    const fallback =
      trimmed === "none"
        ? options.find((o) => o.value === "minimal" || o.value === "low")
        : options.find((o) => o.value === "high");
    return fallback?.value ?? defaultReasoningEffortForModel(modelSlug);
  }
  return defaultReasoningEffortForModel(modelSlug);
}

/**
 * Lowest supported effort for structured JSON scoring (Reifegrad).
 * OpenAI Luna: `none`. Gemini: `minimal` or `low` (never raw `none`).
 */
export function lowestReasoningEffortForScoring(
  modelSlug: string,
): string | null {
  const options = reasoningEffortOptionsForModel(modelSlug);
  if (options.length === 0) return null;
  for (const preferred of ["none", "minimal", "low"] as const) {
    if (options.some((o) => o.value === preferred)) return preferred;
  }
  return options[0]?.value ?? null;
}
