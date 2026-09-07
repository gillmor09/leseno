"use server";

import type { ActionResult } from "@/lib/types/actions";
import {
  generateStoryPipeline,
  type StoryGenerateResult,
} from "@/lib/ai/pipeline";
import type { StoryPipelineProgressCallback } from "@/lib/ai/pipeline-progress";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserFacingMessage } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { storyCreditsForLength } from "@/lib/stories/credits-cost";
import type { StoryLengthStepId } from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";
import { buildPersonalStoryContext } from "@/lib/stories/personal";
import type { StoryGenerateActionData } from "@/lib/stories/story-generate-action-data";
import {
  completeStoryGenerateJob,
  createStoryGenerateJob,
  failStoryGenerateJob,
  getStoryGenerateJobSnapshot,
  updateStoryGenerateJobProgress,
} from "@/lib/stories/story-generate-jobs";
import {
  isTrialLengthStep,
  isTrialSchoolStage,
  TRIAL_MAX_STORIES_PER_IP_PER_DAY,
} from "@/lib/stories/trial-limits";
import { addUserCredits } from "@/lib/stripe/billing-sync";
import { spendMyCredits } from "@/lib/users/billing";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { storyGenerateSchema } from "@/lib/validations/story-generate";
import { loadChildProfile } from "@/lib/world/repository";
import type { StoryPipelineProgressEvent } from "@/lib/ai/pipeline-progress";

export type { StoryGenerateActionData };

const STORY_GENERATE_FALLBACK =
  "Die Geschichte konnte gerade nicht entstehen. Bitte versuche es gleich noch einmal.";

type PreparedStoryGenerate = {
  topic: string;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  personal: ReturnType<typeof buildPersonalStoryContext> | null;
  syllableHelp: boolean;
  includeImages: boolean;
  trialMode: boolean;
  personalMode: boolean;
  profileId?: string;
  packageFeatures: Awaited<ReturnType<typeof loadFeaturesForCurrentUser>>;
  creditCost: number;
  creditsRemaining?: number;
  chargedUserId: string | null;
};

/**
 * Validates input, applies package gates, and spends credits when needed.
 * Shared by the sync action and the admin progress job.
 */
async function prepareFreeStoryGenerate(
  input: unknown,
): Promise<ActionResult<PreparedStoryGenerate>> {
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

  const creditCost = parsed.data.trialMode
    ? 0
    : storyCreditsForLength(parsed.data.lengthStep);
  let creditsRemaining: number | undefined;
  let chargedUserId: string | null = null;

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
      const { assertChildProfileUnlocked } = await import(
        "@/lib/world/profile-pin-access"
      );
      const lockError = await assertChildProfileUnlocked(parsed.data.profileId);
      if (lockError) {
        return { success: false, error: lockError };
      }
      personal = buildPersonalStoryContext(profile, {
        mood: parsed.data.mood,
      });
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

      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Bitte melde dich an, um eine Geschichte zu erzeugen.",
        };
      }

      try {
        creditsRemaining = await spendMyCredits(creditCost);
        chargedUserId = user.id;
      } catch (creditError) {
        return {
          success: false,
          error: toUserFacingMessage(
            creditError,
            "Du hast nicht genug Credits für diese Geschichtenlänge.",
          ),
        };
      }
    }

    return {
      success: true,
      data: {
        topic,
        schoolStage,
        lengthStep: parsed.data.lengthStep,
        mood: parsed.data.mood,
        personal,
        syllableHelp,
        includeImages,
        trialMode: parsed.data.trialMode,
        personalMode: parsed.data.personalMode,
        profileId: parsed.data.profileId,
        packageFeatures,
        creditCost,
        creditsRemaining,
        chargedUserId,
      },
    };
  } catch (error) {
    console.error("[prepareFreeStoryGenerate]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
    };
  }
}

async function finishFreeStoryGenerate(
  prepared: PreparedStoryGenerate,
  onProgress?: StoryPipelineProgressCallback,
): Promise<StoryGenerateActionData> {
  let result: StoryGenerateResult;
  try {
    result = await generateStoryPipeline(
      {
        topic: prepared.topic,
        schoolStage: prepared.schoolStage,
        lengthStep: prepared.lengthStep,
        mood: prepared.mood,
        personal: prepared.personal,
        syllableHelp: prepared.syllableHelp,
        includeImages: prepared.includeImages,
      },
      { onProgress },
    );
  } catch (pipelineError) {
    if (prepared.chargedUserId && prepared.creditCost > 0) {
      try {
        await addUserCredits(prepared.chargedUserId, prepared.creditCost);
      } catch (refundError) {
        console.error(
          "[finishFreeStoryGenerate] credit refund failed",
          refundError,
        );
      }
    }
    throw pipelineError;
  }

  const user = await getCurrentUser();
  let libraryStoryId: string | undefined;
  if (user) {
    const { logUserActivity } = await import("@/lib/users/activity");
    await logUserActivity({
      action: "story.generate",
      label: "Geschichte erzeugen",
      userId: user.id,
      metadata: {
        personalMode: prepared.personalMode,
        lengthStep: prepared.lengthStep,
        mood: prepared.mood,
        schoolStage: prepared.schoolStage,
        includeImages: prepared.includeImages,
        topic: prepared.topic,
        seedSource: prepared.personal?.seedSource,
        gentleFear: prepared.personal?.gentleFear ?? null,
        creditsCharged:
          prepared.creditCost > 0 ? prepared.creditCost : undefined,
      },
    });

    if (
      !prepared.trialMode &&
      featuresInclude(prepared.packageFeatures, "buecherei")
    ) {
      try {
        const { titleFromStoryHtml } = await import(
          "@/lib/stories/title-from-html"
        );
        const { saveMyStory } = await import(
          "@/lib/stories/library-repository"
        );
        libraryStoryId = await saveMyStory({
          title: titleFromStoryHtml(result.story),
          storyHtml: result.story,
          facts: result.facts,
          schoolStage: prepared.schoolStage,
          childProfileId: prepared.personalMode
            ? (prepared.profileId ?? null)
            : null,
          lengthStep: prepared.lengthStep,
          mood: prepared.mood,
          topic: prepared.topic,
          personalMode: prepared.personalMode,
          syllableHelp: prepared.syllableHelp,
          includeImages: prepared.includeImages,
          creditsCharged: prepared.creditCost > 0 ? prepared.creditCost : null,
        });
      } catch (saveError) {
        console.error("[finishFreeStoryGenerate] library save", saveError);
      }
    }
  }

  return {
    ...result,
    ...(libraryStoryId ? { libraryStoryId } : {}),
    ...(prepared.personal
      ? {
          personalSeed: {
            topic: prepared.personal.topic,
            seedSource: prepared.personal.seedSource,
            gentleFear: prepared.personal.gentleFear,
          },
        }
      : {}),
    ...(prepared.creditCost > 0
      ? {
          creditsCharged: prepared.creditCost,
          creditsRemaining: prepared.creditsRemaining,
        }
      : {}),
  };
}

/**
 * Starts the story pipeline: facts → story (+ optional images/layout).
 * Membership stories debit credits by length; trial (`/kostenlos`) is free.
 */
export async function generateFreeStoryAction(
  input: unknown,
): Promise<ActionResult<StoryGenerateActionData>> {
  try {
    const prepared = await prepareFreeStoryGenerate(input);
    if (!prepared.success || !prepared.data) {
      return { success: false, error: prepared.error };
    }
    const data = await finishFreeStoryGenerate(prepared.data);
    return { success: true, data };
  } catch (error) {
    console.error("[generateFreeStoryAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
    };
  }
}

/**
 * Admin-only: starts generation as a background job and returns a pollable id.
 * Wait overlay can show live model/stage via `pollFreeStoryGenerateJobAction`.
 */
export async function startFreeStoryGenerateJobAction(
  input: unknown,
): Promise<ActionResult<{ jobId: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Bitte melde dich an." };
  }

  try {
    const prepared = await prepareFreeStoryGenerate(input);
    if (!prepared.success || !prepared.data) {
      return { success: false, error: prepared.error };
    }

    const jobId = createStoryGenerateJob(user.id);
    const preparedData = prepared.data;

    void (async () => {
      try {
        const data = await finishFreeStoryGenerate(preparedData, (progress) => {
          updateStoryGenerateJobProgress(jobId, progress);
        });
        completeStoryGenerateJob(jobId, data);
      } catch (error) {
        console.error("[startFreeStoryGenerateJobAction] job", error);
        failStoryGenerateJob(
          jobId,
          toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
        );
      }
    })();

    return { success: true, data: { jobId } };
  } catch (error) {
    console.error("[startFreeStoryGenerateJobAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, STORY_GENERATE_FALLBACK),
    };
  }
}

/**
 * Admin-only: polls a story generation job for progress and final result.
 */
export async function pollFreeStoryGenerateJobAction(
  jobId: unknown,
): Promise<
  ActionResult<{
    status: "running" | "done" | "error";
    progress: StoryPipelineProgressEvent | null;
    data?: StoryGenerateActionData;
    error?: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Bitte melde dich an." };
  }

  if (typeof jobId !== "string" || !jobId.trim()) {
    return { success: false, error: "Job-ID fehlt." };
  }

  const snapshot = getStoryGenerateJobSnapshot(jobId.trim(), user.id);
  if (!snapshot) {
    return { success: false, error: "Dieser Job wurde nicht gefunden." };
  }

  return {
    success: true,
    data: {
      status: snapshot.status,
      progress: snapshot.progress,
      data: snapshot.data,
      error: snapshot.error,
    },
  };
}
