/**
 * Routes AI calls by provider from `leseno.ai_models`.
 * Supported: Gemini, Claude, OpenAI (Astra / Luna), OpenAI-compatible (IONOS).
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
  userText: string,
): { systemInstruction?: string; userText: string } {
  if (model.supportsSystemPrompt) {
    return { systemInstruction, userText };
  }
  if (!systemInstruction) {
    return { userText };
  }
  return { userText: `${systemInstruction}\n\n${userText}` };
}

export async function generateText(input: GenerateTextInput): Promise<string> {
  if (!input.model.isActive) {
    throw new Error(`Das Modell „${input.model.label}“ ist deaktiviert.`);
  }

  const provider = input.model.provider.trim().toLowerCase();
  const prompt = buildUserText(
    input.model,
    input.systemInstruction,
    input.userText,
  );
  const jsonOutput = Boolean(
    input.preferJson && input.model.supportsJsonOutput && !input.googleSearch,
  );

  if (provider === "gemini") {
    const result = await generateWithGemini({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      googleSearch: input.googleSearch,
      // Map OpenAI-only values (e.g. "none") to Gemini thinking levels.
      thinkingLevel: resolveReasoningEffort(
        input.model.modelSlug,
        input.reasoningEffort ?? input.model.reasoningEffort ?? null,
      ),
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
      userText: prompt.userText,
      jsonOutput,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });
    return result.text;
  }

  if (provider === "openai") {
    const result = await generateWithOpenAiChat({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
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
    const result = await generateWithOpenAiCompatible({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
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
