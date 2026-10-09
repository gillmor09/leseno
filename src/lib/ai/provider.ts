/**
 * Routes AI calls by provider from `leseno.ai_models`.
 * Supported: Gemini, Claude, OpenAI (Astra / Luna), OpenAI-compatible (IONOS).
 *
 * Optional `cacheablePrefix`: stable book bible (Idee/Recherche/Spec/Ton).
 * Claude uses `cache_control`; OpenAI relies on automatic prefix caching;
 * Gemini uses explicit `cachedContents` when possible.
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { generateWithClaude } from "@/lib/ai/claude";
import { generateWithGemini } from "@/lib/ai/gemini";
import { generateWithOpenAiChat } from "@/lib/ai/openai-chat";
import { generateWithOpenAiCompatible } from "@/lib/ai/openai-compatible";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";

export type GenerateTextInput = {
  model: AiModelConfig;
  systemInstruction?: string;
  /**
   * Byte-stable book context for provider prompt-caching.
   * Put live deltas (graph slice, chapter body, patch brief) only in `userText`.
   */
  cacheablePrefix?: string;
  userText: string;
  preferJson?: boolean;
  /** Optional output cap (Claude + Gemini + OpenAI). */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
  /** Optional OpenAI reasoning_effort (overrides model.reasoningEffort). */
  reasoningEffort?: string | null;
  /**
   * Gemini only: enable Grounding with Google Search.
   * Forces text parsing (no JSON mime type).
   */
  googleSearch?: boolean;
};

function buildUserText(
  model: AiModelConfig,
  systemInstruction: string | undefined,
  cacheablePrefix: string | undefined,
  userText: string,
): {
  systemInstruction?: string;
  cacheablePrefix?: string;
  userText: string;
} {
  const prefix = cacheablePrefix?.trim() || undefined;
  if (model.supportsSystemPrompt) {
    return { systemInstruction, cacheablePrefix: prefix, userText };
  }
  // No system channel: fold role + stable prefix into the user message.
  const head = [systemInstruction?.trim(), prefix].filter(Boolean).join("\n\n");
  if (!head) return { userText };
  return { userText: `${head}\n\n${userText}` };
}

export async function generateText(input: GenerateTextInput): Promise<string> {
  if (!input.model.isActive) {
    throw new Error(`Das Modell „${input.model.label}“ ist deaktiviert.`);
  }

  const provider = input.model.provider.trim().toLowerCase();
  const prompt = buildUserText(
    input.model,
    input.systemInstruction,
    input.cacheablePrefix,
    input.userText,
  );
  const jsonOutput = Boolean(
    input.preferJson && input.model.supportsJsonOutput && !input.googleSearch,
  );

  if (provider === "gemini") {
    const effortRaw = (
      input.reasoningEffort ??
      input.model.reasoningEffort ??
      ""
    )
      .trim()
      .toLowerCase();
    // Structured JSON patches: "none" must mean NO thinkingConfig — mapping to
    // Gemini "minimal" still burns output budget and truncates JSON mid-object.
    const thinkingLevel =
      effortRaw === "none"
        ? null
        : resolveReasoningEffort(input.model.modelSlug, effortRaw || null);
    const result = await generateWithGemini({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      cacheablePrefix: prompt.cacheablePrefix,
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      googleSearch: input.googleSearch,
      thinkingLevel,
    });
    return result.text;
  }

  if (input.googleSearch) {
    throw new Error(
      "Google Search ist nur mit Gemini-Modellen verfügbar.",
    );
  }

  if (provider === "claude") {
    const result = await generateWithClaude({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      cacheablePrefix: prompt.cacheablePrefix,
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      reasoningEffort: resolveReasoningEffort(
        input.model.modelSlug,
        input.reasoningEffort ?? input.model.reasoningEffort ?? null,
      ),
    });
    return result.text;
  }

  if (provider === "openai") {
    const result = await generateWithOpenAiChat({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      cacheablePrefix: prompt.cacheablePrefix,
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      reasoningEffort:
        input.reasoningEffort ?? input.model.reasoningEffort ?? null,
    });
    return result.text;
  }

  if (provider === "openai-compatible") {
    // IONOS: no native cache API — still keep prefix in system for consistency.
    const systemParts = [
      prompt.systemInstruction?.trim() ?? "",
      prompt.cacheablePrefix?.trim() ?? "",
    ].filter(Boolean);
    const result = await generateWithOpenAiCompatible({
      modelSlug: input.model.modelSlug,
      systemInstruction:
        systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });
    return result.text;
  }

  throw new Error(
    `Provider „${input.model.provider}“ ist noch nicht angebunden. Bitte „gemini“, „claude“, „openai“ oder „openai-compatible“ wählen.`,
  );
}
