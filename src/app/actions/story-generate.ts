"use server";

import type { ActionResult } from "@/lib/types/actions";
import {
  generateStoryPipeline,
  type StoryGenerateResult,
} from "@/lib/ai/pipeline";
import { getCurrentUser } from "@/lib/auth/session";
import { assertBotGuard } from "@/lib/security/bot-guard";
import {
  buildPersonalStoryContext,
} from "@/lib/stories/personal";
import { storyGenerateSchema } from "@/lib/validations/story-generate";
import { loadMyWorld } from "@/lib/world/repository";

/**
 * Starts the free-tier story pipeline: facts → (story || FLUX images) → layout.
 * In personal mode, seeds come from Meine Welt (server-side).
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
    let personal = null as ReturnType<typeof buildPersonalStoryContext> | null;
    let topic = parsed.data.topic?.trim() ?? "";

    if (parsed.data.personalMode) {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Für „Ganz persönlich“ melde dich bitte zuerst an.",
        };
      }
      const world = await loadMyWorld();
      personal = buildPersonalStoryContext(world);
      topic = personal.topic;
    }

    const result = await generateStoryPipeline({
      topic,
      schoolStage: parsed.data.schoolStage,
      lengthStep: parsed.data.lengthStep,
      mood: parsed.data.mood,
      personal,
    });
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
