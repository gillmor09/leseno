/**
 * Story length slider: five steps, word bands per age group (5–7 vs 8–10).
 * Canonical values live in `leseno.story_length_limits`; this module maps age → group
 * and formats ranges. Seed/fallback matches the migration.
 */

import type { StoryAge } from "@/lib/stories/options";

export const AGE_GROUP_IDS = ["5-7", "8-10"] as const;
export type AgeGroupId = (typeof AGE_GROUP_IDS)[number];

export const STORY_LENGTH_STEP_IDS = [
  "sehr_kurz",
  "kurz",
  "mittel",
  "lang",
  "sehr_lang",
] as const;
export type StoryLengthStepId = (typeof STORY_LENGTH_STEP_IDS)[number];

export type StoryLengthStep = {
  id: StoryLengthStepId;
  label: string;
  sortOrder: number;
};

export type StoryLengthLimit = {
  id: string;
  ageGroupId: AgeGroupId;
  stepId: StoryLengthStepId;
  minWords: number;
  maxWords: number | null;
};

export type StoryLengthCatalog = {
  steps: StoryLengthStep[];
  limits: StoryLengthLimit[];
};

export const STORY_LENGTH_STEPS: StoryLengthStep[] = [
  { id: "sehr_kurz", label: "Sehr kurz", sortOrder: 1 },
  { id: "kurz", label: "Kurz", sortOrder: 2 },
  { id: "mittel", label: "Mittel", sortOrder: 3 },
  { id: "lang", label: "Lang", sortOrder: 4 },
  { id: "sehr_lang", label: "Sehr lang", sortOrder: 5 },
];

/** Fallback if Postgres is unreachable — same numbers as the migration seed. */
export const FALLBACK_STORY_LENGTH_LIMITS: StoryLengthLimit[] = [
  { id: "fallback-5-7-sehr_kurz", ageGroupId: "5-7", stepId: "sehr_kurz", minWords: 10, maxWords: 30 },
  { id: "fallback-5-7-kurz", ageGroupId: "5-7", stepId: "kurz", minWords: 30, maxWords: 80 },
  { id: "fallback-5-7-mittel", ageGroupId: "5-7", stepId: "mittel", minWords: 80, maxWords: 150 },
  { id: "fallback-5-7-lang", ageGroupId: "5-7", stepId: "lang", minWords: 150, maxWords: 300 },
  { id: "fallback-5-7-sehr_lang", ageGroupId: "5-7", stepId: "sehr_lang", minWords: 300, maxWords: null },
  { id: "fallback-8-10-sehr_kurz", ageGroupId: "8-10", stepId: "sehr_kurz", minWords: 50, maxWords: 150 },
  { id: "fallback-8-10-kurz", ageGroupId: "8-10", stepId: "kurz", minWords: 150, maxWords: 350 },
  { id: "fallback-8-10-mittel", ageGroupId: "8-10", stepId: "mittel", minWords: 350, maxWords: 700 },
  { id: "fallback-8-10-lang", ageGroupId: "8-10", stepId: "lang", minWords: 700, maxWords: 1000 },
  { id: "fallback-8-10-sehr_lang", ageGroupId: "8-10", stepId: "sehr_lang", minWords: 1200, maxWords: null },
];

export function ageGroupForAge(age: StoryAge): AgeGroupId {
  return age <= 7 ? "5-7" : "8-10";
}

export function findLengthLimit(
  catalog: StoryLengthCatalog,
  age: StoryAge,
  stepId: StoryLengthStepId,
): StoryLengthLimit | undefined {
  const ageGroupId = ageGroupForAge(age);
  return catalog.limits.find(
    (limit) => limit.ageGroupId === ageGroupId && limit.stepId === stepId,
  );
}

export function formatWordRange(limit: StoryLengthLimit | undefined): string {
  if (!limit) {
    return "Wortzahl folgt aus dem Alter";
  }
  if (limit.maxWords === null) {
    return `über ${limit.minWords} Wörter`;
  }
  return `${limit.minWords}–${limit.maxWords} Wörter`;
}

export const FALLBACK_STORY_LENGTH_CATALOG: StoryLengthCatalog = {
  steps: STORY_LENGTH_STEPS,
  limits: FALLBACK_STORY_LENGTH_LIMITS,
};
