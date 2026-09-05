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
import {
  isTrialLengthStep,
  isTrialSchoolStage,
  TRIAL_MAX_STORIES_PER_IP_PER_DAY,
} from "@/lib/stories/trial-limits";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
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

  if (parsed.data.trialMode) {
    const trialQuotaError = await assertBotGuard(input, {
      action: "story-generate-trial-daily",
      minFillMs: 0,
      maxRequests: TRIAL_MAX_STORIES_PER_IP_PER_DAY,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (trialQuotaError) {
      return {
        success: false,
        error:
          "Für heute sind die drei kostenlosen Geschichten für diese Adresse aufgebraucht. Bitte morgen erneut versuchen oder ein Konto anlegen.",
      };
    }
    if (!isTrialSchoolStage(parsed.data.schoolStage)) {
      return {
        success: false,
        error: "Im Testmodus sind nur 1. und 2. Klasse wählbar.",
      };
    }
    if (!isTrialLengthStep(parsed.data.lengthStep)) {
      return {
        success: false,
        error: "Im Testmodus sind „Lang“ und „Sehr lang“ nicht verfügbar.",
      };
    }
  }

  try {
    let personal = null as ReturnType<typeof buildPersonalStoryContext> | null;
    let topic = parsed.data.topic?.trim() ?? "";
    let schoolStage = parsed.data.schoolStage;
    let includeImages = parsed.data.includeImages;
    let syllableHelp = parsed.data.syllableHelp;

    const packageFeatures = parsed.data.trialMode
      ? []
      : await loadFeaturesForCurrentUser();

    if (parsed.data.personalMode) {
      if (!featuresInclude(packageFeatures, "meine_welt")) {
        return {
          success: false,
          error:
            "Persönliche Geschichten gehören nicht zu deinem Paket. Bitte wähl Freies lesen oder upgrade.",
        };
      }
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

    if (parsed.data.trialMode) {
      includeImages = false;
      syllableHelp = false;
    } else {
      if (!featuresInclude(packageFeatures, "bilder")) {
        includeImages = false;
      }
      if (!featuresInclude(packageFeatures, "silbenmethode")) {
        syllableHelp = false;
      }
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
