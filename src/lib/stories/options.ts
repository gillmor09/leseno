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

/**
 * „Art der Geschichte“ is a genre choice, not only tone.
 * `genreBrief` is injected into story prompts via `promptValueForMood`.
 */
export const STORY_MOODS = [
  {
    id: "lustig",
    label: "Lustig",
    genreBrief:
      "Schreibe eine spaßige Kindergeschichte als Komödie mit Klamauk: Missgeschicke, Quatsch-Dialoge, witzige Situationen und Lacher. Kindgerecht, ohne gemeinen Humor.",
  },
  {
    id: "spannend",
    label: "Spannend",
    genreBrief:
      "Schreibe die Geschichte als Detektivgeschichte bzw. kindgerechten Krimi: Rätsel, Spuren, Verdacht, Spannung und eine klare Auflösung. Ohne echte Gewalt und ohne Angstmachen.",
  },
  {
    id: "motivierend",
    label: "Motivierend",
    genreBrief:
      "Schreibe die Geschichte im Stil eines Motivationscoaches: die Hauptfigur wächst an Herausforderungen, glaubt an sich („Wenn du willst, schaffst du alles“), übt durch und schafft es. Kraftvoll und ermutigend, nicht belehrend.",
  },
] as const;

export type StoryMoodId = (typeof STORY_MOODS)[number]["id"];

/** Label + genre brief for LLM placeholders (`{{story_mood}}`). */
export function promptValueForMood(mood: StoryMoodId): string {
  const entry = STORY_MOODS.find((item) => item.id === mood);
  if (!entry) {
    return mood;
  }
  return `${entry.label} — ${entry.genreBrief}`;
}

/** Top-10 theme chips on `/geschichte` (no free-text topic). */
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
