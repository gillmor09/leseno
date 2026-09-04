/**
 * Meine Welt: one auth user may own many child profiles.
 * `experiences` = wish-list ("Das möchte ich mal erleben").
 * `fears` = "Davor habe ich Angst".
 * Extras: Bilder, Silbenhilfe, Wort-Markierung, Vorlesbar (`readableAloud`).
 * Story defaults: schoolStage, lengthStep, mood.
 */

import type { StoryLengthStepId } from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";

export type ChildProfile = {
  id: string;
  displayName: string;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  friends: string[];
  interests: string[];
  experiences: string[];
  fears: string[];
  includeImages: boolean;
  syllableHelp: boolean;
  wordHighlight: boolean;
  /** When true, story UI shows play + tempo (Vorlesbar). */
  readableAloud: boolean;
  /** Story composer starts with this profile (at most one per user). */
  isDefault: boolean;
  sortOrder: number;
};

/** Profile fields without id (create draft / form body). */
export type ChildProfileFields = Omit<ChildProfile, "id" | "sortOrder">;

/** Lightweight row for story-page tabs + extras applied on select. */
export type ChildProfileOption = {
  id: string;
  displayName: string;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  /** Name + at least one interest or wish-list experience. */
  personalReady: boolean;
  hasName: boolean;
  hasTopicSeeds: boolean;
  includeImages: boolean;
  syllableHelp: boolean;
  wordHighlight: boolean;
  readableAloud: boolean;
  isDefault: boolean;
};

/** Defaults for Freies lesen (no profile). */
export const FREE_READING_EXTRAS = {
  includeImages: false,
  syllableHelp: false,
  wordHighlight: false,
  readableAloud: true,
} as const;

export const EMPTY_CHILD_PROFILE_FIELDS: ChildProfileFields = {
  displayName: "",
  schoolStage: "klasse_3",
  lengthStep: "mittel",
  mood: "spannend",
  friends: [],
  interests: [],
  experiences: [],
  fears: [],
  includeImages: false,
  syllableHelp: false,
  wordHighlight: false,
  readableAloud: true,
  /** New profiles are the default until the user turns it off. */
  isDefault: true,
};

/** Alias used by personal-story helpers (same shape as form fields). */
export type UserWorldProfile = ChildProfileFields;

export const EMPTY_USER_WORLD = EMPTY_CHILD_PROFILE_FIELDS;
