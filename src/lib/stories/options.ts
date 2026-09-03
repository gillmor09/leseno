/**
 * Free-tier story composer options (school stages instead of numeric ages).
 * Generation logic will consume these values later; keep labels in sync with the UI.
 */

export const STORY_SCHOOL_STAGES = [
  { id: "vorschule", label: "Vorschule" },
  { id: "klasse_1", label: "1. Klasse" },
  { id: "klasse_2", label: "2. Klasse" },
  { id: "klasse_3", label: "3. Klasse" },
  { id: "klasse_4", label: "4. Klasse" },
  { id: "hoeher", label: "Höher" },
] as const;

export type StorySchoolStageId = (typeof STORY_SCHOOL_STAGES)[number]["id"];

export const STORY_MOODS = [
  { id: "lustig", label: "Lustig" },
  { id: "spannend", label: "Spannend" },
  { id: "motivierend", label: "Motivierend" },
] as const;

export type StoryMoodId = (typeof STORY_MOODS)[number]["id"];

export const TOPIC_EXAMPLES = [
  "Dinosaurier",
  "Weltall",
  "Vulkane",
  "Freundschaft",
  "Tiere im Meer",
  "Ritter",
] as const;
