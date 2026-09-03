"use server";

import type { ActionResult } from "@/lib/types/actions";
import {
  generateStoryPipeline,
  type StoryGenerateResult,
} from "@/lib/ai/pipeline";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { storyGenerateSchema } from "@/lib/validations/story-generate";

/**
 * Starts the free-tier story pipeline: facts research, then story writing.
 * Both stages use the models assigned in the prompt admin catalog.
 */
export async function generateFreeStoryAction(
  input: unknown,
): Promise<ActionResult<StoryGenerateResult>> {
  const botError = await assertBotGuard(input, {
    action: "story-generate",
    minFillMs: 2000,
    maxRequests: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = storyGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const result = await generateStoryPipeline(parsed.data);
    return { success: true, data: result };
  } catch (error) {
    console.error("[generateFreeStoryAction]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Die Geschichte konnte nicht erzeugt werden.";
    return {
      success: false,
      error: message,
    };
  }
}
