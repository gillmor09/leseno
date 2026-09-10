/**
 * Builds FLUX.2 illustration briefs from story context (no LLM planning step).
 * Pixel generation: IONOS / Gemini via `images-default`.
 * Count depends on target story length: ≤300 → 1, ≤1000 → 2, else → 3.
 *
 * Theme fidelity first: every prompt must make the story topic unmistakable.
 * Never feed fact sentences or character names into the pixel prompt —
 * FLUX treats prose/numbers as text to paint. Keep prompts purely visual.
 */

import {
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import {
  isStoryTopTopic,
  type StoryMoodId,
  type StorySchoolStageId,
  type StoryTopTopic,
  type StoryTopicMixPatternId,
  topicAgeBandForStage,
} from "@/lib/stories/options";

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
  /** Optional Nebenthema — must appear as a clear visual motif when set. */
  topicSecondary?: string | null;
  topicMixPattern?: StoryTopicMixPatternId | null;
  schoolStage: StorySchoolStageId;
  schoolStageLabel: string;
  /** Short UI genre label (Lustig / Abenteuer / Motivierend). */
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
    "Kid-safe adventure vibe: journey, obstacles, determined exploring, optional light mystery clues, no scary violence.",
  motivierend:
    "Growth and courage vibe: determined child practicing through a challenge, hopeful breakthrough, can-do spirit — not a lecture.",
};

/**
 * Catalog topic → English visual motifs (what must appear in the picture).
 * Early band = younger flavour; later = older kids.
 */
const TOPIC_VISUAL_MOTIFS_EARLY: Record<StoryTopTopic, string> = {
  Tiere:
    "friendly animals as clear focal subjects — pets, forest creatures, or talking-animal energy",
  Feuerwehr:
    "fire-rescue world: fire truck shapes, firefighter gear, station yard, gentle emergency help",
  Drachen:
    "a friendly dragon or mythical creature with soft scales and warm glow — fantasy, not scary",
  Dinos:
    "prehistoric adventure: dinosaurs, fossils, jungle ferns, explorer kids in urzeit setting",
  Quatsch:
    "silly slapstick props and goofy mishaps — comic visual gags, not a bland room",
  Magie:
    "gentle magic: glowing charms, fairy sparkles, wand shapes, enchanted soft light",
  Freundschaft:
    "two or more kids connecting — shared adventure, teamwork, warm togetherness",
  Detektive:
    "kid detective clues: magnifying glass shapes, footprints, mystery map shapes (no readable text)",
  Märchen:
    "fairy-tale world: cottage, castle silhouette, enchanted forest, classic storybook props",
  Natur:
    "nature outdoors: forest, farm, seasons, trees, streams, wildlife as setting",
  Schule:
    "school life: classroom shapes, schoolyard, backpacks, chalk-free boards as blank surfaces",
  Superhelden:
    "kid superhero energy: cape shapes, bold poses, city rooftop or backyard ‘HQ’",
  Piraten:
    "pirate adventure: ship deck, treasure chest shapes, ocean, sails (no writing on flags)",
  Sport:
    "active sports: ball, bike, field or court, movement and team gear without logos",
  Musik:
    "music moment: instruments as shapes, dancing, stage lights — no sheet music notes as text",
  Weltraum:
    "space adventure: rocket, moon, stars, planet landscape, astronaut kid suit",
  Grusel:
    "playful spooky-lite: friendly ghost shapes, night flashlight glow, cozy not horror",
  Reisen:
    "travel adventure: camping tent, suitcase shapes, scenic trip landscape",
  Roboter:
    "friendly robot companion, gadgets, workshop invention vibe",
  Gaming:
    "colorful game-world vibe: blocky/pixel-inspired scenery, controller shapes, playful virtual quest",
  Zeitreisen:
    "time-travel portal glow with a historical or futuristic landmark as clear setting",
};

const TOPIC_VISUAL_MOTIFS_LATER: Record<StoryTopTopic, string> = {
  Tiere:
    "magical animal companions, wildlife rescue, or animal shapeshifter energy as focal subjects",
  Feuerwehr:
    "realistic rescue heroics: firefighters, disaster-response gear, dramatic but kid-safe action",
  Drachen:
    "epic fantasy dragon or dangerous-looking-but-safe monster in a fantasy landscape",
  Dinos:
    "time-travel urzeit survival: dinosaurs, survival gear, prehistoric wilderness",
  Quatsch:
    "diary-style school chaos and anti-hero slapstick — specific funny situation props",
  Magie:
    "magical academy / shape-shifter powers: glowing abilities, enchanted halls, spell effects as light only",
  Freundschaft:
    "tight friend group / crew on a shared quest — loyalty and daring together",
  Detektive:
    "escape-room / secret-society clues: coded symbols as abstract shapes only, investigation gear",
  Märchen:
    "reimagined fairy-tale setting with a clear classic motif twisted for older kids",
  Natur:
    "wilderness survival / outdoor knowledge: wild landscape, camping, weather drama",
  Schule:
    "school embarrassment / prank energy: classroom or hallway with clear school markers",
  Superhelden:
    "hidden powers / sci-fi hero: bold powers as light effects, urban or lab setting",
  Piraten:
    "high-seas pirate raid energy: ship, island, treasure hunt without readable maps",
  Sport:
    "tournament sports or esports stage: arena, team kits without logos, competitive energy",
  Musik:
    "band / casting / music-school stage: instruments, spotlights, performance pose",
  Weltraum:
    "aliens, galaxies, futuristic spacecraft — clear space-opera setting",
  Grusel:
    "thriller-lite: haunted house silhouettes, eerie glow, spooky but not gory",
  Reisen:
    "island or wilderness trip adventure with clear destination landmarks",
  Roboter:
    "AI / inventor lab: robots, circuits as abstract glow, sci-fi workshop",
  Gaming:
    "Minecraft/Roblox-like adventure world: blocky terrain, quest props, avatar kids",
  Zeitreisen:
    "historical portal scene: Egypt, knights, or other era landmark mixed with modern kid",
};

const STYLE_PREFIX =
  "Children's book illustration, warm soft lighting, clear shapes, friendly and safe for ages 5–10, purely pictorial artwork";

/**
 * Maps target word count to illustration count.
 * ≤300 → 1, ≤1000 → 2, otherwise → 3.
 */
export function illustrationCountForWordTarget(wordCount: number): number {
  if (wordCount <= 300) return 1;
  if (wordCount <= 1000) return 2;
  return 3;
}

function motifForTopic(
  topic: string,
  schoolStage: StorySchoolStageId,
): string | null {
  const trimmed = topic.trim();
  if (!isStoryTopTopic(trimmed)) return null;
  const band = topicAgeBandForStage(schoolStage);
  const table =
    band === "early" ? TOPIC_VISUAL_MOTIFS_EARLY : TOPIC_VISUAL_MOTIFS_LATER;
  return table[trimmed] ?? null;
}

/**
 * English visual subject from a free-text personal seed / custom topic.
 * Keeps it short and pictorial — no German lecture prose.
 */
function freeTextVisualSubject(topic: string): string {
  const cue = sanitizeFluxVisualCue(topic, 90);
  if (!cue) return "a clear children's adventure subject";
  return `the story subject “${cue}” shown as concrete pictorial elements (setting, props, creatures, or action tied to that subject)`;
}

function themeVisualBrief(context: FluxIllustrationContext): string {
  const main = context.topic.trim();
  const secondary = context.topicSecondary?.trim() || "";
  const mainMotif =
    motifForTopic(main, context.schoolStage) ?? freeTextVisualSubject(main);

  if (secondary) {
    const secondaryMotif =
      motifForTopic(secondary, context.schoolStage) ??
      freeTextVisualSubject(secondary);
    return [
      `STORY THEME (must dominate the image at a glance): ${mainMotif}.`,
      `SECONDARY THEME (include at least one unmistakable visual cue): ${secondaryMotif}.`,
      "Do not paint a generic playground, empty bedroom, or random park that could fit any story — the themes must be obvious.",
    ].join(" ");
  }

  return [
    `STORY THEME (must dominate the image at a glance): ${mainMotif}.`,
    "Fill the frame with theme-specific setting, props, and action.",
    "Do not paint a generic playground, empty bedroom, or random park that could fit any story — the theme must be obvious.",
  ].join(" ");
}

type SceneSpec = {
  alt: (topic: string) => string;
  placementHint: string;
  floatClass: FluxIllustrationPlan["floatClass"];
  beat: string;
};

const SCENE_SPECS: SceneSpec[] = [
  {
    alt: (topic) => `Illustration zu ${topic}`,
    placementHint:
      "Nach dem Einstieg; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--left",
    beat: "Opening story beat: introduce the theme world immediately — iconic theme elements front and center, a child exploring that world, emotions via faces and body language only.",
  },
  {
    alt: (topic) => `Weitere Illustration zu ${topic}`,
    placementHint:
      "Zur Mitte der Geschichte; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--right",
    beat: "Middle story beat: action and discovery still locked to the same theme — new angle, same world, theme props/creatures remain unmistakable.",
  },
  {
    alt: (topic) => `Abschlussillustration zu ${topic}`,
    placementHint:
      "Zum Ende der Geschichte; Text fließt mit 1rem Abstand am Bild vorbei",
    floatClass: "story-illustration--left",
    beat: "Closing beat: warm resolution still clearly inside the theme world — soft light, togetherness, theme elements still visible.",
  },
];

/**
 * Creates 1–3 FLUX prompts grounded in topic (+ optional Nebenthema) and mood.
 */
export function buildFluxIllustrationPlans(
  context: FluxIllustrationContext,
): FluxIllustrationPlan[] {
  const count = Math.min(3, Math.max(1, Math.round(context.imageCount)));
  const themeBrief = themeVisualBrief(context);
  const topicLabel =
    sanitizeFluxVisualCue(context.topic, 40) || "Abenteuer";
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
      alt: spec.alt(topicLabel),
      placementHint: spec.placementHint,
      floatClass: spec.floatClass,
      imagePrompt: [
        STYLE_PREFIX,
        FLUX_NO_TEXT_BLOCK,
        themeBrief,
        `Genre visual vibe (${context.moodLabel}): ${MOOD_VISUAL_CUES[context.moodId]}.`,
        ...castBits,
        spec.beat,
        index > 0
          ? "Different camera angle and composition from previous illustration, but the same story theme must remain unmistakable."
          : "",
        "Square composition, 256x256, illustration only.",
        FLUX_NO_TEXT_BLOCK,
        "Again: absolutely no text, letters, numbers, or signs in the picture.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return plans;
}
