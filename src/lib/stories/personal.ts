/**
 * Resolves "Ganz persönlich" story seeds from Meine Welt.
 * Topic: fair random pick between interests and wish-list experiences.
 * Fears: excluded by default; optional gentle weave for spannend/motivierend.
 */

import { randomInt } from "crypto";
import type { StoryMoodId } from "@/lib/stories/options";
import type { UserWorldProfile } from "@/lib/world/catalog";
import { UserFacingError } from "@/lib/errors/user-facing";

export type PersonalStoryContext = {
  topic: string;
  protagonistName: string;
  friendNames: string[];
  seedSource: "interest" | "experience";
  /** Fear labels to avoid entirely. */
  avoidFears: string[];
  /** When set, weave this one fear very gently (spannend / motivierend only). */
  gentleFear: string | null;
};

/** ~40% chance to gently include one fear when the profile toggle is on. */
const GENTLE_FEAR_CHANCE_PERCENT = 40;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueTrimmed(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = normalizeLabel(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function pickRandom<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error("pickRandom: empty list");
  }
  if (items.length === 1) return items[0]!;
  return items[randomInt(0, items.length)]!;
}

/** True when a candidate topic overlaps a fear label (exact or containment). */
function topicMatchesFear(topic: string, fear: string): boolean {
  const t = normalizeLabel(topic);
  const f = normalizeLabel(fear);
  if (!t || !f) return false;
  if (t === f) return true;
  if (t.length >= 3 && f.length >= 3 && (t.includes(f) || f.includes(t))) {
    return true;
  }
  return false;
}

/**
 * Fair seed pick: if both lists have entries, 50/50 which list wins,
 * then uniform within that list (avoids bias when one list is longer).
 */
export function pickPersonalTopicSeed(
  interests: string[],
  experiences: string[],
): { topic: string; seedSource: "interest" | "experience" } {
  const interestPool = uniqueTrimmed(interests);
  const experiencePool = uniqueTrimmed(experiences);
  const hasI = interestPool.length > 0;
  const hasE = experiencePool.length > 0;

  if (!hasI && !hasE) {
    throw new UserFacingError(
      "Für „Ganz persönlich“ brauchst du in Meine Welt mindestens ein Interesse oder etwas unter „Das möchte ich mal erleben“.",
    );
  }

  if (hasI && hasE) {
    const useInterest = randomInt(0, 2) === 0;
    if (useInterest) {
      return {
        topic: pickRandom(interestPool),
        seedSource: "interest",
      };
    }
    return {
      topic: pickRandom(experiencePool),
      seedSource: "experience",
    };
  }

  if (hasI) {
    return { topic: pickRandom(interestPool), seedSource: "interest" };
  }
  return { topic: pickRandom(experiencePool), seedSource: "experience" };
}

function moodAllowsGentleFear(mood: StoryMoodId | undefined): boolean {
  return mood === "spannend" || mood === "motivierend";
}

/**
 * Builds personalization for the pipeline. Throws a German error when data is missing.
 * Pass `forceTopic` for continuations / Advent so the cast stays stable without re-rolling.
 * Pass `mood` (generation mood) to decide gentle fear weaving.
 */
export function buildPersonalStoryContext(
  world: UserWorldProfile,
  options?: {
    forceTopic?: string | null;
    forceSeedSource?: "interest" | "experience";
    mood?: StoryMoodId;
  },
): PersonalStoryContext {
  const protagonistName = world.displayName.trim();
  if (!protagonistName) {
    throw new UserFacingError(
      "Für „Ganz persönlich“ brauchst du in Meine Welt einen Namen.",
    );
  }

  const fears = uniqueTrimmed(world.fears);
  const fearsGentle = Boolean(world.fearsGentle);

  const interests = uniqueTrimmed(world.interests).filter(
    (topic) => !fears.some((fear) => topicMatchesFear(topic, fear)),
  );
  const experiences = uniqueTrimmed(world.experiences).filter(
    (topic) => !fears.some((fear) => topicMatchesFear(topic, fear)),
  );

  const forced = options?.forceTopic?.trim() ?? "";
  let chosen: { topic: string; seedSource: "interest" | "experience" };

  if (forced) {
    if (fears.some((fear) => topicMatchesFear(forced, fear))) {
      try {
        chosen = pickPersonalTopicSeed(interests, experiences);
      } catch {
        throw new UserFacingError(
          "Dieses Thema überschneidet sich mit „Davor habe ich Angst“. Bitte ergänze in Meine Welt ein anderes Interesse oder Erlebnis.",
        );
      }
    } else {
      const forcedNorm = normalizeLabel(forced);
      const fromInterest = interests.find(
        (topic) => normalizeLabel(topic) === forcedNorm,
      );
      const fromExperience = experiences.find(
        (topic) => normalizeLabel(topic) === forcedNorm,
      );
      chosen = fromInterest
        ? { topic: fromInterest, seedSource: "interest" }
        : fromExperience
          ? { topic: fromExperience, seedSource: "experience" }
          : {
              topic: forced,
              seedSource: options?.forceSeedSource ?? "interest",
            };
    }
  } else {
    if (interests.length === 0 && experiences.length === 0) {
      const hadAny =
        world.interests.some((item) => item.trim()) ||
        world.experiences.some((item) => item.trim());
      throw new UserFacingError(
        hadAny
          ? "Alle Interessen und Wünsche überschneiden sich mit „Davor habe ich Angst“. Bitte ergänze in Meine Welt ein anderes Interesse oder Erlebnis."
          : "Für „Ganz persönlich“ brauchst du in Meine Welt mindestens ein Interesse oder etwas unter „Das möchte ich mal erleben“.",
      );
    }
    chosen = pickPersonalTopicSeed(interests, experiences);
  }

  let gentleFear: string | null = null;
  let avoidFears = [...fears];

  if (
    fearsGentle &&
    fears.length > 0 &&
    moodAllowsGentleFear(options?.mood)
  ) {
    const roll = randomInt(0, 100);
    if (roll < GENTLE_FEAR_CHANCE_PERCENT) {
      gentleFear = pickRandom(fears);
      avoidFears = fears.filter(
        (fear) => normalizeLabel(fear) !== normalizeLabel(gentleFear!),
      );
    }
  }

  const friendNames = uniqueTrimmed(world.friends).filter(
    (name) => name.toLowerCase() !== protagonistName.toLowerCase(),
  );

  return {
    topic: chosen.topic,
    protagonistName,
    friendNames,
    seedSource: chosen.seedSource,
    avoidFears,
    gentleFear,
  };
}

/**
 * True when the profile can power "Ganz persönlich".
 */
export function canUsePersonalMode(world: UserWorldProfile): boolean {
  if (!world.displayName.trim()) return false;
  const fears = uniqueTrimmed(world.fears);
  return (
    [...world.interests, ...world.experiences]
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((topic) => !fears.some((fear) => topicMatchesFear(topic, fear)))
      .length > 0
  );
}

/**
 * Prompt block: chosen seed, cast, fear avoid / optional gentle weave.
 */
export function buildPersonalPromptBlock(context: PersonalStoryContext): string {
  const seedLabel =
    context.seedSource === "experience"
      ? "Wunsch („Das möchte ich mal erleben“)"
      : "Interesse";
  const friends =
    context.friendNames.length > 0
      ? context.friendNames.join(", ")
      : "(keine weiteren Namen — erfinde bei Bedarf kindgerechte Nebenfiguren)";

  const lines = [
    `Persönlicher Kern (${seedLabel}) — DAS ist das verbindliche Leitthema der Geschichte: ${context.topic}`,
    `Wähle kein anderes Leitthema. Handlung, Schauplatz und Aha-Momente drehen sich um genau diesen Kern.`,
    `Hauptfigur / Protagonist:in: ${context.protagonistName} (genau diesen Namen verwenden)`,
    `Freundesliste (nur als Nebenfiguren, optional): ${friends}`,
    `Wichtig: Freunde überschreiben nicht das Leitthema. Keine Geschichte „nur um Freunde zu treffen“, außer der persönliche Kern lautet ausdrücklich so.`,
  ];

  if (context.gentleFear) {
    lines.push(
      `Sanfte Angst-Einbindung (gewünscht): Baue „${context.gentleFear}“ nur ganz leicht und altersgerecht ein — ein kleiner Moment, den die Hauptfigur sicher und ermutigend meistert. Kein Grusel, keine Panik, keine Dauerangst. Maximal ein kurzer Bezug.`,
    );
  }

  if (context.avoidFears.length > 0) {
    lines.push(
      `Ausschluss („Davor habe ich Angst“) — strikt meiden, weder als Motiv noch als Scherz noch als Nebenhandlung: ${context.avoidFears.join(", ")}`,
    );
  } else if (!context.gentleFear) {
    lines.push(
      `Ausschluss: Keine Angst-Themen erfinden; bleib beim persönlichen Kern.`,
    );
  }

  return lines.join("\n");
}
