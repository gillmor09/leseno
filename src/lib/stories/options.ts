/**
 * Free-tier story composer options (school stages instead of numeric ages).
 * Generation logic consumes these values; keep labels in sync with the UI.
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

/** Top-10 theme chips on `/basis` (no free-text topic). */
export const STORY_TOP_TOPICS = [
  "Magie & Geheimnisse",
  "Abenteuer & Entdeckungen",
  "Tierwelt & Tierhelden",
  "Lachen & Quatsch",
  "Detektive & Rätsel",
  "Freundschaft & Banden",
  "Helden, Gaming & Action",
  "Dinos & Urzeit",
  "Grusel & Monster",
  "Sport & Power",
] as const;

export type StoryTopTopic = (typeof STORY_TOP_TOPICS)[number];

/** @deprecated Prefer STORY_TOP_TOPICS */
export const TOPIC_EXAMPLES = STORY_TOP_TOPICS;
