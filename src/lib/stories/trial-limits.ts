/**
 * Public `/kostenlos` trial limits (UI + server enforcement).
 */

import type { StoryLengthStepId } from "@/lib/stories/length";
import type { StorySchoolStageId } from "@/lib/stories/options";

export const TRIAL_ALLOWED_SCHOOL_STAGES = [
  "klasse_1",
  "klasse_2",
] as const satisfies readonly StorySchoolStageId[];

export type TrialSchoolStageId = (typeof TRIAL_ALLOWED_SCHOOL_STAGES)[number];

export const TRIAL_DISABLED_LENGTH_STEPS = [
  "lang",
  "sehr_lang",
] as const satisfies readonly StoryLengthStepId[];

export const TRIAL_ALLOWED_LENGTH_STEPS = [
  "sehr_kurz",
  "kurz",
  "mittel",
] as const satisfies readonly StoryLengthStepId[];

export type TrialLengthStepId = (typeof TRIAL_ALLOWED_LENGTH_STEPS)[number];

/** Max story generations per client IP per calendar day (UTC window via bot-guard). */
export const TRIAL_MAX_STORIES_PER_IP_PER_DAY = 3;

export const TRIAL_DEFAULT_SCHOOL_STAGE: TrialSchoolStageId = "klasse_1";
export const TRIAL_DEFAULT_LENGTH_STEP: TrialLengthStepId = "mittel";

export function isTrialSchoolStage(
  value: string,
): value is TrialSchoolStageId {
  return (TRIAL_ALLOWED_SCHOOL_STAGES as readonly string[]).includes(value);
}

export function isTrialLengthStep(value: string): value is TrialLengthStepId {
  return (TRIAL_ALLOWED_LENGTH_STEPS as readonly string[]).includes(value);
}
