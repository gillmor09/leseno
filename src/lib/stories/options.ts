/**
 * Free-tier story composer options (age 5–10).
 * Generation logic will consume these values later; keep labels in sync with the UI.
 */

export const STORY_AGES = [5, 6, 7, 8, 9, 10] as const;

export type StoryAge = (typeof STORY_AGES)[number];

export const STORY_MOODS = [
  { id: "lustig", label: "Lustig" },
  { id: "spannend", label: "Spannend" },
  { id: "informativ", label: "Informativ" },
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
