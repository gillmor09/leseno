/**
 * Routes AI calls by provider from `leseno.ai_models`.
 * First wave: Gemini only; other providers fail with a clear German message.
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { generateWithGemini } from "@/lib/ai/gemini";

export type GenerateTextInput = {
  model: AiModelConfig;
  systemInstruction?: string;
  userText: string;
  preferJson?: boolean;
};

export async function generateText(input: GenerateTextInput): Promise<string> {
  if (!input.model.isActive) {
    throw new Error(`Das Modell „${input.model.label}“ ist deaktiviert.`);
  }

  const provider = input.model.provider.trim().toLowerCase();

  if (provider === "gemini") {
    const result = await generateWithGemini({
      modelSlug: input.model.modelSlug,
      systemInstruction: input.model.supportsSystemPrompt
        ? input.systemInstruction
        : undefined,
      userText:
        input.model.supportsSystemPrompt || !input.systemInstruction
          ? input.userText
          : `${input.systemInstruction}\n\n${input.userText}`,
      jsonOutput: Boolean(input.preferJson && input.model.supportsJsonOutput),
    });
    return result.text;
  }

  throw new Error(
    `Provider „${input.model.provider}“ ist noch nicht angebunden. Bitte im Admin auf „gemini“ umstellen.`,
  );
}
