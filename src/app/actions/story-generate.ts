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
import { loadChildProfile } from "@/lib/world/repository";

const STORY_GENERATE_FALLBACK =
  "Die Geschichte konnte gerade nicht entstehen. Bitte versuche es gleich noch einmal.";

/**
 * Starts the free-tier story pipeline: facts → story (+ optional images/layout).
 * In personal mode, seeds come from the selected Meine-Welt child profile (server-side).
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
    let schoolStage = parsed.data.schoolStage;
    let includeImages = parsed.data.includeImages;
    let syllableHelp = parsed.data.syllableHelp;

    if (parsed.data.personalMode) {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Für eine persönliche Geschichte melde dich bitte zuerst an.",
        };
      }
      if (!parsed.data.profileId) {
        return {
          success: false,
          error: "Bitte wähl ein Kinder-Profil.",
        };
      }
      const profile = await loadChildProfile(parsed.data.profileId);
      if (!profile) {
        return {
          success: false,
          error: "Dieses Profil wurde nicht gefunden. Bitte Meine Welt prüfen.",
        };
      }
      personal = buildPersonalStoryContext(profile);
      topic = personal.topic;
      schoolStage = profile.schoolStage;
      includeImages = profile.includeImages;
      syllableHelp = profile.syllableHelp;
    }

    const result = await generateStoryPipeline({
      topic,
      schoolStage,
      lengthStep: parsed.data.lengthStep,
      mood: parsed.data.mood,
      personal,
      syllableHelp,
      includeImages,
    });

    const user = await getCurrentUser();
    if (user) {
      const { logUserActivity } = await import("@/lib/users/activity");
      await logUserActivity({
        action: "story.generate",
        label: "Geschichte erzeugen",
        userId: user.id,
        metadata: {
          personalMode: parsed.data.personalMode,
          lengthStep: parsed.data.lengthStep,
          mood: parsed.data.mood,
          schoolStage,
          includeImages,
          topic,
        },
      });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("[generateFreeStoryAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
    };
  }
}
