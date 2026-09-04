"use server";

import type { ActionResult } from "@/lib/types/actions";
import {
  generateStoryPipeline,
  type StoryGenerateResult,
} from "@/lib/ai/pipeline";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserFacingMessage } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { buildPersonalStoryContext } from "@/lib/stories/personal";
import { storyGenerateSchema } from "@/lib/validations/story-generate";
import { loadMyWorld } from "@/lib/world/repository";

const STORY_GENERATE_FALLBACK =
  "Die Geschichte konnte gerade nicht entstehen. Bitte versuche es gleich noch einmal.";

/**
 * Starts the free-tier story pipeline: facts → story (+ optional images/layout).
 * In personal mode, seeds come from Meine Welt (server-side).
 * Provider errors are logged server-side; the client only gets fixed German copy.
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
      syllableHelp: parsed.data.syllableHelp,
      includeImages: parsed.data.includeImages,
    });
    return { success: true, data: result };
  } catch (error) {
    console.error("[generateFreeStoryAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
    };
  }
}
