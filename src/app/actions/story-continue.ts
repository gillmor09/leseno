"use server";

/**
 * Continues a library story (“Wie könnte es weitergehen?”).
 * Requires package feature `fortsetzen` (+ `buecherei` to persist the link).
 */

import type { ActionResult } from "@/lib/types/actions";
import {
  generateContinuationPipeline,
  type StoryGenerateResult,
} from "@/lib/ai/pipeline";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserFacingMessage } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { storyCreditsForLength } from "@/lib/stories/credits-cost";
import { buildPersonalStoryContext } from "@/lib/stories/personal";
import { addUserCredits } from "@/lib/stripe/billing-sync";
import { spendMyCredits } from "@/lib/users/billing";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { storyContinueSchema } from "@/lib/validations/story-continue";
import { loadChildProfile } from "@/lib/world/repository";

const CONTINUE_FALLBACK =
  "Die Fortsetzung konnte gerade nicht entstehen. Bitte versuche es gleich noch einmal.";

export type StoryContinueActionData = StoryGenerateResult & {
  libraryStoryId: string;
  creditsRemaining?: number;
  creditsCharged?: number;
};

/**
 * Loads the parent story, generates a continuation, saves it linked in the library.
 */
export async function continueStoryAction(
  input: unknown,
): Promise<ActionResult<StoryContinueActionData>> {
  const botError = await assertBotGuard(input, {
    action: "story-continue",
    minFillMs: 800,
    maxRequests: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = storyContinueSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Bitte melde dich an." };
  }

  const packageFeatures = await loadFeaturesForCurrentUser();
  if (!featuresInclude(packageFeatures, "fortsetzen")) {
    return {
      success: false,
      error: "Geschichten fortsetzen gehört nicht zu deinem Paket.",
    };
  }
  if (!featuresInclude(packageFeatures, "buecherei")) {
    return {
      success: false,
      error: "Fortsetzungen werden in der Bücherei gespeichert — bitte upgrade.",
    };
  }

  const creditCost = storyCreditsForLength(parsed.data.lengthStep);
  let creditsRemaining: number | undefined;
  let chargedUserId: string | null = null;

  try {
    const { getMyStory, saveMyStory } = await import(
      "@/lib/stories/library-repository"
    );
    const parent = await getMyStory(parsed.data.parentStoryId);
    if (!parent) {
      return { success: false, error: "Vorgeschichte nicht gefunden." };
    }

    let personal = null as ReturnType<typeof buildPersonalStoryContext> | null;
    let includeImages = parent.includeImages;
    let syllableHelp = parent.syllableHelp;

    if (parent.personalMode && parent.childProfileId) {
      if (featuresInclude(packageFeatures, "meine_welt")) {
        const profile = await loadChildProfile(parent.childProfileId);
        if (profile) {
          const { assertChildProfileUnlocked } = await import(
            "@/lib/world/profile-pin-access"
          );
          const lockError = await assertChildProfileUnlocked(profile.id);
          if (lockError) {
            return { success: false, error: lockError };
          }
          personal = buildPersonalStoryContext(profile, {
            forceTopic: parent.topic,
            mood: parsed.data.mood,
          });
          includeImages =
            featuresInclude(packageFeatures, "bilder") && profile.includeImages;
          syllableHelp =
            featuresInclude(packageFeatures, "silbenmethode") &&
            profile.syllableHelp;
        }
      }
    } else {
      includeImages =
        featuresInclude(packageFeatures, "bilder") && parent.includeImages;
      syllableHelp =
        featuresInclude(packageFeatures, "silbenmethode") &&
        parent.syllableHelp;
    }

    if (creditCost > 0) {
      try {
        creditsRemaining = await spendMyCredits(creditCost);
        chargedUserId = user.id;
      } catch (creditError) {
        return {
          success: false,
          error: toUserFacingMessage(
            creditError,
            "Nicht genug Credits für diese Fortsetzung. Bitte Credits nachladen.",
          ),
        };
      }
    }

    const topic =
      parsed.data.topic?.trim() ||
      parent.topic?.trim() ||
      "Fortsetzung";

    let result: StoryGenerateResult;
    try {
      result = await generateContinuationPipeline({
        previousStoryHtml: parent.storyHtml,
        topic,
        schoolStage: parsed.data.schoolStage,
        lengthStep: parsed.data.lengthStep,
        mood: parsed.data.mood,
        personal,
        syllableHelp,
        includeImages,
      });
    } catch (pipelineError) {
      if (chargedUserId && creditCost > 0) {
        try {
          await addUserCredits(chargedUserId, creditCost);
        } catch (refundError) {
          console.error(
            "[continueStoryAction] credit refund failed",
            refundError,
          );
        }
      }
      throw pipelineError;
    }

    const { titleFromStoryHtml } = await import(
      "@/lib/stories/title-from-html"
    );
    const libraryStoryId = await saveMyStory({
      title: titleFromStoryHtml(result.story),
      storyHtml: result.story,
      facts: result.facts,
      schoolStage: parsed.data.schoolStage,
      childProfileId: parent.childProfileId,
      lengthStep: parsed.data.lengthStep,
      mood: parsed.data.mood,
      topic,
      personalMode: parent.personalMode,
      syllableHelp,
      includeImages,
      creditsCharged: creditCost > 0 ? creditCost : null,
      parentStoryId: parent.id,
    });

    const { logUserActivity } = await import("@/lib/users/activity");
    await logUserActivity({
      action: "story.continue",
      label: "Geschichte fortsetzen",
      userId: user.id,
      metadata: {
        parentStoryId: parent.id,
        lengthStep: parsed.data.lengthStep,
        mood: parsed.data.mood,
        schoolStage: parsed.data.schoolStage,
        creditsCharged: creditCost > 0 ? creditCost : undefined,
      },
    });

    return {
      success: true,
      data: {
        ...result,
        libraryStoryId,
        ...(creditCost > 0
          ? { creditsCharged: creditCost, creditsRemaining }
          : {}),
      },
    };
  } catch (error) {
    console.error("[continueStoryAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, CONTINUE_FALLBACK),
    };
  }
}
