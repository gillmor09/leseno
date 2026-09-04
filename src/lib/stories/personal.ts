/**
 * Resolves "Ganz persönlich" story seeds from Meine Welt.
 * Topic comes from a random interest or wish-list experience;
 * protagonist = display name; supporting names = friends.
 */

import type { UserWorldProfile } from "@/lib/world/catalog";

export type PersonalStoryContext = {
  topic: string;
  protagonistName: string;
  friendNames: string[];
  seedSource: "interest" | "experience";
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Builds personalization for the pipeline. Throws a German error when data is missing.
 */
export function buildPersonalStoryContext(
  world: UserWorldProfile,
): PersonalStoryContext {
  const protagonistName = world.displayName.trim();
  if (!protagonistName) {
    throw new Error(
      "Für „Ganz persönlich“ brauchst du in Meine Welt einen Namen.",
    );
  }

  const interests = world.interests.map((item) => item.trim()).filter(Boolean);
  const experiences = world.experiences
    .map((item) => item.trim())
    .filter(Boolean);
  const pool: Array<{ topic: string; seedSource: "interest" | "experience" }> =
    [
      ...interests.map((topic) => ({ topic, seedSource: "interest" as const })),
      ...experiences.map((topic) => ({
        topic,
        seedSource: "experience" as const,
      })),
    ];

  if (pool.length === 0) {
    throw new Error(
      "Für „Ganz persönlich“ brauchst du in Meine Welt mindestens ein Interesse oder etwas unter „Das möchte ich mal erleben“.",
    );
  }

  const chosen = pickRandom(pool);
  const friendNames = world.friends
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== protagonistName.toLowerCase());

  return {
    topic: chosen.topic,
    protagonistName,
    friendNames,
    seedSource: chosen.seedSource,
  };
}

/**
 * True when the profile can power "Ganz persönlich".
 */
export function canUsePersonalMode(world: UserWorldProfile): boolean {
  if (!world.displayName.trim()) return false;
  return world.interests.length > 0 || world.experiences.length > 0;
}

/**
 * Prompt block describing cast and personal seed for LLM stages.
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

  return [
    `Persönlicher Kern (${seedLabel}): ${context.topic}`,
    `Hauptfigur / Protagonist:in: ${context.protagonistName} (genau diesen Namen verwenden)`,
    `Weitere Namen aus der Freundesliste (gerne als Freund:innen einbauen): ${friends}`,
  ].join("\n");
}
