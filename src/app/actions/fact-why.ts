"use server";

/**
 * Server Actions for fact „Warum?“ / „Ich will mehr wissen“.
 * Gated by package features `warum` and `hintergrund`.
 */

import type { ActionResult } from "@/lib/types/actions";
import { toUserFacingMessage } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import {
  explainFactWhy,
  explainFactWhyMore,
} from "@/lib/stories/fact-why";
import { currentUserHasFeature } from "@/lib/users/package-access";
import { factWhyMoreSchema, factWhySchema } from "@/lib/validations/fact-why";

const FACT_WHY_FALLBACK =
  "Die Erklärung konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.";

const FEATURE_DENIED = "Diese Funktion gehört nicht zu deinem Paket.";

/**
 * Loads a short background explanation for one learned fact.
 */
export async function explainFactWhyAction(
  input: unknown,
): Promise<ActionResult<{ text: string }>> {
  const botError = await assertBotGuard(input, {
    action: "fact-why",
    minFillMs: 0,
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  if (!(await currentUserHasFeature("warum"))) {
    return { success: false, error: FEATURE_DENIED };
  }

  const parsed = factWhySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const text = await explainFactWhy({
      fact: parsed.data.fact,
      schoolStage: parsed.data.schoolStage,
    });
    return { success: true, data: { text } };
  } catch (error) {
    console.error("[explainFactWhyAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, FACT_WHY_FALLBACK),
    };
  }
}

/**
 * Loads a deeper follow-up using fact + previous background as context.
 */
export async function explainFactWhyMoreAction(
  input: unknown,
): Promise<ActionResult<{ text: string }>> {
  const botError = await assertBotGuard(input, {
    action: "fact-why-more",
    minFillMs: 0,
    maxRequests: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  if (!(await currentUserHasFeature("hintergrund"))) {
    return { success: false, error: FEATURE_DENIED };
  }

  const parsed = factWhyMoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const text = await explainFactWhyMore({
      fact: parsed.data.fact,
      schoolStage: parsed.data.schoolStage,
      background: parsed.data.background,
    });
    return { success: true, data: { text } };
  } catch (error) {
    console.error("[explainFactWhyMoreAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, FACT_WHY_FALLBACK),
    };
  }
}
