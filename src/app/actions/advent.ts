"use server";

/**
 * Advent calendar book (Ultimate): create, generate days 1–24, PIN preview, gated read.
 */

import type { ActionResult } from "@/lib/types/actions";
import { generateAdventDayPipeline } from "@/lib/ai/pipeline";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserFacingMessage } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import {
  ADVENT_DAY_COUNT,
  isAdventDoorOpen,
  resolveAdventYear,
} from "@/lib/stories/advent";
import { hashAdventPin, verifyAdventPin } from "@/lib/stories/advent-pin";
import {
  clearAdventPreviewCookie,
  hasAdventPreviewCookie,
  setAdventPreviewCookie,
} from "@/lib/stories/advent-preview-cookie";
import {
  createMyAdventBook,
  getAdventDayForPreview,
  getMyAdventBook,
  getMyAdventDay,
  getMyAdventDayHtmlForGenerate,
  linkMyAdventDayStory,
  listMyAdventBooks,
  listMyAdventDayMeta,
  markMyAdventBookFailed,
  saveMyAdventDay,
  type AdventBookSummary,
  type AdventDayContent,
  type AdventDayMeta,
} from "@/lib/stories/advent-repository";
import { adventBookCreditsForLength } from "@/lib/stories/credits-cost";
import { buildPersonalStoryContext } from "@/lib/stories/personal";
import { titleFromStoryHtml } from "@/lib/stories/title-from-html";
import { addUserCredits } from "@/lib/stripe/billing-sync";
import { spendMyCredits } from "@/lib/users/billing";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import {
  adventBookCreateSchema,
  adventBookIdSchema,
  adventGenerateDaySchema,
  adventGetDaySchema,
  adventUnlockPreviewSchema,
} from "@/lib/validations/advent";
import { loadChildProfile } from "@/lib/world/repository";

const ADVENT_FALLBACK =
  "Das Adventskalenderbuch konnte gerade nicht entstehen. Bitte versuche es gleich noch einmal.";

async function assertAdventFeature(): Promise<string | null> {
  const features = await loadFeaturesForCurrentUser();
  if (!featuresInclude(features, "adventskalender")) {
    return "Das Adventskalenderbuch gehört nur zum Paket Ultimate.";
  }
  return null;
}

/**
 * Creates the book shell, charges 24× length credits, returns id for day generation.
 */
export async function createAdventBookAction(
  input: unknown,
): Promise<
  ActionResult<{ bookId: string; year: number; creditsRemaining?: number }>
> {
  const botError = await assertBotGuard(input, {
    action: "advent-create",
    minFillMs: 800,
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (botError) return { success: false, error: botError };

  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  const parsed = adventBookCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const packageFeatures = await loadFeaturesForCurrentUser();
  const creditCost = adventBookCreditsForLength(parsed.data.lengthStep);
  let creditsRemaining: number | undefined;
  let chargedUserId: string | null = null;

  try {
    let topic = parsed.data.topic?.trim() ?? "";
    let schoolStage = parsed.data.schoolStage;
    let includeImages = parsed.data.includeImages;
    let syllableHelp = parsed.data.syllableHelp;
    let childProfileId: string | null = null;
    let personalMode = parsed.data.personalMode;

    if (personalMode) {
      if (!featuresInclude(packageFeatures, "meine_welt")) {
        return {
          success: false,
          error: "Persönliche Geschichten brauchen „Meine Welt“.",
        };
      }
      const profile = await loadChildProfile(parsed.data.profileId!);
      if (!profile) {
        return { success: false, error: "Kinder-Profil nicht gefunden." };
      }
      childProfileId = profile.id;
      schoolStage = profile.schoolStage;
      topic = `Advent mit ${profile.displayName || "Kind"}`;
      includeImages =
        featuresInclude(packageFeatures, "bilder") && profile.includeImages;
      syllableHelp =
        featuresInclude(packageFeatures, "silbenmethode") &&
        profile.syllableHelp;
    } else {
      includeImages =
        featuresInclude(packageFeatures, "bilder") && includeImages;
      syllableHelp =
        featuresInclude(packageFeatures, "silbenmethode") && syllableHelp;
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
            "Nicht genug Credits für das Adventskalenderbuch.",
          ),
        };
      }
    }

    const year = resolveAdventYear();
    const title = `Adventskalender ${year}`;

    try {
      const bookId = await createMyAdventBook({
        title,
        year,
        topic: topic || "Adventsabenteuer",
        schoolStage,
        lengthStep: parsed.data.lengthStep,
        mood: parsed.data.mood,
        pinHash: hashAdventPin(parsed.data.pin),
        childProfileId,
        personalMode,
        syllableHelp,
        includeImages,
        creditsCharged: creditCost > 0 ? creditCost : null,
      });

      const { logUserActivity } = await import("@/lib/users/activity");
      await logUserActivity({
        action: "advent.create",
        label: "Adventskalenderbuch angelegt",
        userId: user.id,
        metadata: {
          bookId,
          year,
          lengthStep: parsed.data.lengthStep,
          creditsCharged: creditCost > 0 ? creditCost : undefined,
        },
      });

      return {
        success: true,
        data: {
          bookId,
          year,
          ...(creditCost > 0 ? { creditsRemaining } : {}),
        },
      };
    } catch (createError) {
      if (chargedUserId && creditCost > 0) {
        try {
          await addUserCredits(chargedUserId, creditCost);
        } catch (refundError) {
          console.error("[createAdventBookAction] refund failed", refundError);
        }
      }
      throw createError;
    }
  } catch (error) {
    console.error("[createAdventBookAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, ADVENT_FALLBACK),
    };
  }
}

/**
 * Generates one Advent day (call sequentially 1→24). Refunds one day on failure.
 */
export async function generateAdventDayAction(
  input: unknown,
): Promise<
  ActionResult<{ dayNumber: number; daysReady: number; title: string }>
> {
  const botError = await assertBotGuard(input, {
    action: "advent-generate-day",
    minFillMs: 0,
    maxRequests: 40,
    windowMs: 60 * 60 * 1000,
  });
  if (botError) return { success: false, error: botError };

  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  const parsed = adventGenerateDaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
    };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const book = await getMyAdventBook(parsed.data.bookId);
  if (!book) {
    return { success: false, error: "Adventskalenderbuch nicht gefunden." };
  }
  if (book.status === "ready" && book.daysReady >= 24) {
    return {
      success: false,
      error: "Dieses Adventskalenderbuch ist bereits fertig.",
    };
  }

  const dayNumber = parsed.data.dayNumber;
  if (dayNumber !== book.daysReady + 1) {
    return {
      success: false,
      error: `Als Nächstes ist Tag ${book.daysReady + 1} dran.`,
    };
  }

  const packageFeatures = await loadFeaturesForCurrentUser();
  const dayCredit = Math.floor(
    (book.lengthStep
      ? adventBookCreditsForLength(book.lengthStep)
      : 0) / ADVENT_DAY_COUNT,
  );

  try {
    let personal = null as ReturnType<typeof buildPersonalStoryContext> | null;
    if (book.personalMode && book.childProfileId) {
      if (featuresInclude(packageFeatures, "meine_welt")) {
        const profile = await loadChildProfile(book.childProfileId);
        if (profile) {
          personal = buildPersonalStoryContext(profile, {
            forceTopic: book.topic,
            mood: book.mood,
          });
        }
      }
    }

    let previousHtml = "";
    if (dayNumber > 1) {
      previousHtml =
        (await getMyAdventDayHtmlForGenerate(book.id, dayNumber - 1)) ?? "";
      if (!previousHtml.trim()) {
        return {
          success: false,
          error: `Vortag ${dayNumber - 1} fehlt — bitte Generierung fortsetzen.`,
        };
      }
    }

    const topic =
      book.topic?.trim() ||
      `Adventskalenderbuch ${book.year}`;

    let result;
    try {
      result = await generateAdventDayPipeline({
        adventDay: dayNumber,
        adventYear: book.year,
        previousStoryHtml: previousHtml,
        topic,
        schoolStage: book.schoolStage,
        lengthStep: book.lengthStep,
        mood: book.mood,
        personal,
        syllableHelp: book.syllableHelp,
        includeImages: book.includeImages,
      });
    } catch (pipelineError) {
      if (dayCredit > 0) {
        try {
          await addUserCredits(user.id, dayCredit);
        } catch (refundError) {
          console.error(
            "[generateAdventDayAction] day refund failed",
            refundError,
          );
        }
      }
      if (dayNumber === 1) {
        try {
          await markMyAdventBookFailed(book.id);
        } catch {
          /* ignore */
        }
      }
      throw pipelineError;
    }

    const title = titleFromStoryHtml(result.story);
    await saveMyAdventDay({
      bookId: book.id,
      dayNumber,
      title,
      storyHtml: result.story,
      facts: result.facts,
    });

    return {
      success: true,
      data: {
        dayNumber,
        daysReady: dayNumber,
        title,
      },
    };
  } catch (error) {
    console.error("[generateAdventDayAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, ADVENT_FALLBACK),
    };
  }
}

export async function unlockAdventPreviewAction(
  input: unknown,
): Promise<ActionResult<{ previewActive: true }>> {
  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  const parsed = adventUnlockPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige PIN.",
    };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const book = await getMyAdventBook(parsed.data.bookId);
  if (!book) {
    return { success: false, error: "Adventskalenderbuch nicht gefunden." };
  }

  if (!verifyAdventPin(parsed.data.pin, book.pinHash)) {
    return { success: false, error: "Die PIN stimmt nicht." };
  }

  await setAdventPreviewCookie(user.id, book.id);
  return { success: true, data: { previewActive: true } };
}

export async function lockAdventPreviewAction(
  input: unknown,
): Promise<ActionResult<{ previewActive: false }>> {
  const parsed = adventBookIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültiges Adventskalenderbuch." };
  }
  await clearAdventPreviewCookie(parsed.data.bookId);
  return { success: true, data: { previewActive: false } };
}

export async function getAdventDayAction(
  input: unknown,
): Promise<
  ActionResult<{
    day: AdventDayContent;
    previewActive: boolean;
    libraryStoryId?: string;
  }>
> {
  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  const parsed = adventGetDaySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Angaben." };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const book = await getMyAdventBook(parsed.data.bookId);
  if (!book) {
    return { success: false, error: "Adventskalenderbuch nicht gefunden." };
  }

  const previewActive = await hasAdventPreviewCookie(user.id, book.id);
  const doorOpen = isAdventDoorOpen(parsed.data.dayNumber, book.year);

  let day: AdventDayContent | null;
  if (previewActive || doorOpen) {
    if (previewActive && !doorOpen) {
      day = await getAdventDayForPreview(
        user.id,
        book.id,
        parsed.data.dayNumber,
      );
    } else {
      day = await getMyAdventDay(book.id, parsed.data.dayNumber);
      if (day?.isLocked && previewActive) {
        day = await getAdventDayForPreview(
          user.id,
          book.id,
          parsed.data.dayNumber,
        );
      }
    }
  } else {
    day = await getMyAdventDay(book.id, parsed.data.dayNumber);
  }

  if (!day) {
    return {
      success: false,
      error: "Dieser Adventstag ist noch nicht erzeugt.",
    };
  }

  if (day.isLocked && !previewActive) {
    return {
      success: true,
      data: { day, previewActive: false },
    };
  }

  // Sync unlocked day into Bücherei (parent chain) once.
  let libraryStoryId = day.userStoryId ?? undefined;
  const features = await loadFeaturesForCurrentUser();
  if (
    featuresInclude(features, "buecherei") &&
    day.storyHtml &&
    !day.userStoryId
  ) {
    try {
      const { saveMyStory } = await import("@/lib/stories/library-repository");
      let parentStoryId: string | null = null;
      if (parsed.data.dayNumber > 1) {
        const prevMeta = await listMyAdventDayMeta(book.id);
        const prev = prevMeta.find(
          (entry) => entry.dayNumber === parsed.data.dayNumber - 1,
        );
        parentStoryId = prev?.userStoryId ?? null;
      }
      libraryStoryId = await saveMyStory({
        title: day.title,
        storyHtml: day.storyHtml,
        facts: day.facts,
        schoolStage: book.schoolStage,
        childProfileId: book.childProfileId,
        lengthStep: book.lengthStep,
        mood: book.mood,
        topic: book.topic,
        personalMode: book.personalMode,
        syllableHelp: book.syllableHelp,
        includeImages: book.includeImages,
        parentStoryId,
      });
      await linkMyAdventDayStory(
        book.id,
        parsed.data.dayNumber,
        libraryStoryId,
      );
      day = { ...day, userStoryId: libraryStoryId, isLocked: false };
    } catch (syncError) {
      console.error("[getAdventDayAction] library sync", syncError);
    }
  }

  return {
    success: true,
    data: {
      day: { ...day, isLocked: false },
      previewActive,
      ...(libraryStoryId ? { libraryStoryId } : {}),
    },
  };
}

export async function listAdventBooksAction(): Promise<
  ActionResult<{ books: AdventBookSummary[] }>
> {
  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  try {
    const books = await listMyAdventBooks();
    return { success: true, data: { books } };
  } catch (error) {
    return {
      success: false,
      error: toUserFacingMessage(error, "Adventsbücher laden fehlgeschlagen."),
    };
  }
}

export async function getAdventBookViewAction(
  input: unknown,
): Promise<
  ActionResult<{
    book: Omit<NonNullable<Awaited<ReturnType<typeof getMyAdventBook>>>, "pinHash">;
    days: AdventDayMeta[];
    previewActive: boolean;
  }>
> {
  const featureError = await assertAdventFeature();
  if (featureError) return { success: false, error: featureError };

  const parsed = adventBookIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültiges Adventskalenderbuch." };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const book = await getMyAdventBook(parsed.data.bookId);
  if (!book) {
    return { success: false, error: "Adventskalenderbuch nicht gefunden." };
  }

  const days = await listMyAdventDayMeta(book.id);
  const previewActive = await hasAdventPreviewCookie(user.id, book.id);
  const { pinHash: _pin, ...safeBook } = book;

  return {
    success: true,
    data: { book: safeBook, days, previewActive },
  };
}
