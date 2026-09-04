/**
 * Routes AI calls by provider from `leseno.ai_models`.
 * Supported: Gemini and OpenAI-compatible (IONOS AI Model Hub).
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { generateWithGemini } from "@/lib/ai/gemini";
import { generateWithOpenAiCompatible } from "@/lib/ai/openai-compatible";

export type GenerateTextInput = {
  model: AiModelConfig;
  systemInstruction?: string;
  userText: string;
  preferJson?: boolean;
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
  const jsonOutput = Boolean(input.preferJson && input.model.supportsJsonOutput);

  if (provider === "gemini") {
    const result = await generateWithGemini({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      userText: prompt.userText,
      jsonOutput,
    });
    return result.text;
  }

  if (provider === "openai-compatible") {
    const result = await generateWithOpenAiCompatible({
      modelSlug: input.model.modelSlug,
      systemInstruction: prompt.systemInstruction,
      userText: prompt.userText,
      jsonOutput,
    });
    return result.text;
  }

  throw new Error(
    `Provider „${input.model.provider}“ ist noch nicht angebunden. Bitte „gemini“ oder „openai-compatible“ wählen.`,
  );
}
