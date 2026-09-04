/**
 * Builds FLUX.2 illustration briefs from story context (no LLM planning step).
 * Pixel generation: IONOS `black-forest-labs/FLUX.2-klein-4B` at 256×256.
 * Count depends on target story length: ≤300 → 1, ≤1000 → 2, else → 3.
 *
 * Important: never feed fact sentences or character names into the pixel prompt —
 * FLUX treats prose/numbers as text to paint. Keep prompts purely visual.
 */

import type { StoryMoodId } from "@/lib/stories/options";

export type FluxIllustrationPlan = {
  id: string;
  alt: string;
  imagePrompt: string;
  placementHint: string;
  /** CSS modifier for text wrap: float left or right. */
  floatClass: "story-illustration--left" | "story-illustration--right";
};

export type FluxIllustrationContext = {
  topic: string;
  schoolStageLabel: string;
  /** Short UI label (Lustig / Spannend / Motivierend). */
  moodLabel: string;
  /** Genre id — drives visual vibe without dumping German prose into FLUX. */
  moodId: StoryMoodId;
  facts: string[];
  /** Desired illustration count (1–3), derived from text length. */
  imageCount: number;
  /** Optional cast for "Ganz persönlich" illustrations. */
  protagonistName?: string;
  friendNames?: string[];
};

/** English visual cues aligned with story genre (not only tone). */
const MOOD_VISUAL_CUES: Record<StoryMoodId, string> = {
  lustig:
    "Comedy slapstick vibe: funny mishaps, playful exaggerated expressions, lighthearted clowning around.",
  spannend:
    "Kid-safe detective mystery vibe: clues, searching, suspenseful investigation energy, no scary violence.",
  motivierend:
    "Motivational coach vibe: determined child overcoming a challenge, triumphant confident energy, can-do spirit.",
};

const STYLE_PREFIX =
  "Children's book illustration, warm soft lighting, clear shapes, friendly and safe for ages 5–10, purely pictorial artwork";

/**
 * Repeated hard negatives — FLUX ignores soft wording; stack them around the scene.
 */
const NO_TEXT_BLOCK = [
  "CRITICAL: the image must contain ZERO text of any kind",
  "no letters, no alphabet characters, no words, no writing, no typography, no calligraphy",
  "no numbers, no digits, no numerals, no math symbols",
  "no signs, no posters, no labels, no captions, no titles, no subtitles",
  "no speech bubbles, no thought bubbles, no comics lettering",
  "no book pages with writing, no notebooks with writing, no chalkboards with writing",
  "no logos, no watermarks, no brand marks, no UI, no menus",
  "blank empty surfaces only — skies, walls, ground, clothing without symbols",
  "do not render any readable or unreadable glyphs",
].join(". ");

/**
 * Maps target word count to illustration count.
 * ≤300 → 1, ≤1000 → 2, otherwise → 3.
 */
export function illustrationCountForWordTarget(wordCount: number): number {
  if (wordCount <= 300) return 1;
  if (wordCount <= 1000) return 2;
  return 3;
}

/**
 * Soft visual theme words only — strips digits and quote marks that FLUX paints as text.
 */
function visualThemeCue(topic: string): string {
  return topic
    .replace(/[0-9]+/g, " ")
    .replace(/[„“”"«»'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

type SceneSpec = {
  alt: (topic: string) => string;
  placementHint: string;
  floatClass: FluxIllustrationPlan["floatClass"];
  sceneLine: (theme: string) => string;
};

const SCENE_SPECS: SceneSpec[] = [
  {
    alt: (topic) => `Illustration zu ${topic}`,
    placementHint:
      "Nach dem Einstieg; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--left",
    sceneLine: (theme) =>
      `Opening story scene about ${theme}: a child explorer in a vivid setting, emotions shown with faces and body language only.`,
  },
  {
    alt: (topic) => `Weitere Illustration zu ${topic}`,
    placementHint:
      "Zur Mitte der Geschichte; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--right",
    sceneLine: (theme) =>
      `Middle story moment about ${theme}: action and discovery, friendly atmosphere, no props with writing.`,
  },
  {
    alt: (topic) => `Abschlussillustration zu ${topic}`,
    placementHint:
      "Zum Ende der Geschichte; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--left",
    sceneLine: (theme) =>
      `Closing warm scene about ${theme}: resolution and togetherness, soft light, empty backgrounds without symbols.`,
  },
];

/**
 * Creates 1–3 FLUX prompts grounded in topic and mood (not fact prose).
 */
export function buildFluxIllustrationPlans(
  context: FluxIllustrationContext,
): FluxIllustrationPlan[] {
  const count = Math.min(3, Math.max(1, Math.round(context.imageCount)));
  const theme = visualThemeCue(context.topic) || "a children's adventure";
  const plans: FluxIllustrationPlan[] = [];

  const castBits: string[] = [];
  if (context.protagonistName?.trim()) {
    // Never put the actual name string in the prompt — FLUX paints names as text.
    castBits.push(
      "Main character is a friendly child hero (age-appropriate), expressive face, no name tags or writing on clothes.",
    );
  }
  if (context.friendNames && context.friendNames.length > 0) {
    castBits.push(
      `Up to ${Math.min(3, context.friendNames.length)} friendly child companions may appear nearby, no name tags.`,
    );
  }

  for (let index = 0; index < count; index += 1) {
    const spec = SCENE_SPECS[index]!;
    plans.push({
      id: `ill-${index + 1}`,
      alt: spec.alt(context.topic),
      placementHint: spec.placementHint,
      floatClass: spec.floatClass,
      imagePrompt: [
        STYLE_PREFIX,
        NO_TEXT_BLOCK,
        `Genre visual vibe (${context.moodLabel}): ${MOOD_VISUAL_CUES[context.moodId]}.`,
        ...castBits,
        spec.sceneLine(theme),
        index > 0
          ? "Different camera angle and setting from previous illustration."
          : "",
        "Square composition, 256x256, illustration only.",
        NO_TEXT_BLOCK,
        "Again: absolutely no text, letters, numbers, or signs in the picture.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return plans;
}
