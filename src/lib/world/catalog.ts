/**
 * Meine Welt: one auth user may own many child profiles.
 * `experiences` = wish-list ("Das möchte ich mal erleben").
 * `fears` = "Davor habe ich Angst".
 * `fearsGentle` = optionally weave one fear gently into spannend/motivierend stories.
 * Extras: Bilder, Silbenhilfe, Wort-Markierung, Vorlesbar (`readableAloud`).
 * Story defaults: schoolStage, lengthStep, mood.
 * Lesemodus: `readingModePrefs` (typography + column width).
 */

import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import { READING_MODE_DEFAULTS } from "@/lib/stories/reading-mode-prefs";
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
  /**
   * When true, spannend/motivierend stories may gently include one fear
   * (see `buildPersonalStoryContext`).
   */
  fearsGentle: boolean;
  includeImages: boolean;
  syllableHelp: boolean;
  wordHighlight: boolean;
  /** When true, story UI shows play + tempo (Vorlesbar). */
  readableAloud: boolean;
  /** Story composer starts with this profile (at most one per user). */
  isDefault: boolean;
  /** Lesemodus override; null = follow admin stage Standard. */
  readingModePrefs: ReadingModePrefs | null;
  /** Optional parent PIN is set (hash never exposed to the client). */
  hasPin: boolean;
  sortOrder: number;
};

/** Profile fields without id (create draft / form body). */
export type ChildProfileFields = Omit<
  ChildProfile,
  "id" | "sortOrder" | "readingModePrefs" | "hasPin"
>;

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
  /** null = follow admin stage Standard in Lesemodus. */
  readingModePrefs: ReadingModePrefs | null;
  /** Parent PIN required before selecting / editing. */
  hasPin: boolean;
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
  fearsGentle: false,
  includeImages: false,
  syllableHelp: false,
  wordHighlight: false,
  readableAloud: true,
  /** New profiles are the default until the user turns it off. */
  isDefault: true,
};

/** @deprecated Prefer READING_MODE_DEFAULTS from reading-mode-prefs. */
export const DEFAULT_READING_MODE_PREFS = READING_MODE_DEFAULTS;

/** Alias used by personal-story helpers (same shape as form fields). */
export type UserWorldProfile = ChildProfileFields;

export const EMPTY_USER_WORLD = EMPTY_CHILD_PROFILE_FIELDS;
