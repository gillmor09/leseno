/**
 * Story length slider: five steps, target word count per school-stage group.
 * Canonical values live in `leseno.story_length_limits.anzahl_woerter`.
 */

import type { StorySchoolStageId } from "@/lib/stories/options";

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
  /** Target word count the story should approximately reach. */
  anzahlWoerter: number;
  factCount: number;
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

/** Fallback if Postgres is unreachable — same targets as former min band. */
export const FALLBACK_STORY_LENGTH_LIMITS: StoryLengthLimit[] = [
  { id: "fallback-5-7-sehr_kurz", ageGroupId: "5-7", stepId: "sehr_kurz", anzahlWoerter: 10, factCount: 1 },
  { id: "fallback-5-7-kurz", ageGroupId: "5-7", stepId: "kurz", anzahlWoerter: 30, factCount: 2 },
  { id: "fallback-5-7-mittel", ageGroupId: "5-7", stepId: "mittel", anzahlWoerter: 80, factCount: 3 },
  { id: "fallback-5-7-lang", ageGroupId: "5-7", stepId: "lang", anzahlWoerter: 150, factCount: 4 },
  { id: "fallback-5-7-sehr_lang", ageGroupId: "5-7", stepId: "sehr_lang", anzahlWoerter: 300, factCount: 5 },
  { id: "fallback-8-10-sehr_kurz", ageGroupId: "8-10", stepId: "sehr_kurz", anzahlWoerter: 50, factCount: 1 },
  { id: "fallback-8-10-kurz", ageGroupId: "8-10", stepId: "kurz", anzahlWoerter: 150, factCount: 2 },
  { id: "fallback-8-10-mittel", ageGroupId: "8-10", stepId: "mittel", anzahlWoerter: 350, factCount: 3 },
  { id: "fallback-8-10-lang", ageGroupId: "8-10", stepId: "lang", anzahlWoerter: 700, factCount: 4 },
  { id: "fallback-8-10-sehr_lang", ageGroupId: "8-10", stepId: "sehr_lang", anzahlWoerter: 1200, factCount: 5 },
];

export function ageGroupForSchoolStage(stage: StorySchoolStageId): AgeGroupId {
  if (
    stage === "vorschule" ||
    stage === "klasse_1" ||
    stage === "klasse_2"
  ) {
    return "5-7";
  }

  return "8-10";
}

export function findLengthLimit(
  catalog: StoryLengthCatalog,
  stage: StorySchoolStageId,
  stepId: StoryLengthStepId,
): StoryLengthLimit | undefined {
  const ageGroupId = ageGroupForSchoolStage(stage);
  return catalog.limits.find(
    (limit) => limit.ageGroupId === ageGroupId && limit.stepId === stepId,
  );
}

/** Human-readable target for UI and prompts. */
export function formatWordTarget(limit: StoryLengthLimit | undefined): string {
  if (!limit) {
    return "Wortzahl folgt aus der Schulstufe";
  }
  return `ca. ${limit.anzahlWoerter} Wörter`;
}

export const FALLBACK_STORY_LENGTH_CATALOG: StoryLengthCatalog = {
  steps: STORY_LENGTH_STEPS,
  limits: FALLBACK_STORY_LENGTH_LIMITS,
};
