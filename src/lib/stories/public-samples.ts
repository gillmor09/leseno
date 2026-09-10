/**
 * Public Beispiele pinboard: random Öffentlich book-club stories as excerpts / Wissen.
 */

import { createClient } from "@/lib/supabase/server";
import { plainTextFromStoryHtml } from "@/lib/stories/plain-text-from-html";
import {
  formatStoryBasedOnLabel,
  STORY_MOODS,
  type StoryTopicSeedSource,
} from "@/lib/stories/options";

export type PublicStorySample = {
  id: string;
  title: string;
  moodLabel: string | null;
  basedOn: string | null;
  excerpt: string;
  fact: string | null;
};

export type PinboardPin = {
  id: string;
  kind: "excerpt" | "fact";
  title: string;
  body: string;
  moodLabel: string | null;
  basedOn: string | null;
  /** Deterministic layout jitter from story id. */
  rotateDeg: number;
  colorClass: string;
  offsetX: number;
  offsetY: number;
};

const PIN_COLORS = [
  "bg-amber-50 ring-amber-700/15",
  "bg-orange-50 ring-orange-700/15",
  "bg-yellow-50 ring-yellow-700/20",
  "bg-white ring-zinc-950/10",
  "bg-rose-50 ring-rose-700/10",
  "bg-sky-50 ring-sky-700/10",
] as const;

function asFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asMoodLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mood = STORY_MOODS.find((entry) => entry.id === value);
  return mood?.label ?? null;
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Soft story excerpt for pin notes (not the full HTML). */
export function excerptFromStoryHtml(html: string, maxChars = 220): string {
  const plain = plainTextFromStoryHtml(html)
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  if (plain.length <= maxChars) return plain;
  const slice = plain.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.55 ? lastSpace : maxChars;
  return `${slice.slice(0, cut).trim()}…`;
}

/**
 * Loads a random set of Öffentlich stories and maps them to pinboard cards.
 */
export async function loadPublicStoryPinboard(
  limit = 12,
): Promise<PinboardPin[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_public_story_samples", {
    p_limit: limit,
  });
  if (error) {
    console.error("[loadPublicStoryPinboard]", error.message);
    return [];
  }

  const samples: PublicStorySample[] = (
    (data ?? []) as Record<string, unknown>[]
  ).map((row) => {
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
    const title =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : "Ohne Titel";
    const facts = asFacts(row.facts);
    const seed =
      row.topic_seed_source === "interest" ||
      row.topic_seed_source === "experience"
        ? (row.topic_seed_source as StoryTopicSeedSource)
        : null;
    return {
      id,
      title,
      moodLabel: asMoodLabel(row.mood),
      basedOn: formatStoryBasedOnLabel({
        topic: typeof row.topic === "string" ? row.topic : null,
        topicSecondary:
          typeof row.topic_secondary === "string" ? row.topic_secondary : null,
        topicSeedSource: seed,
        personalMode: Boolean(row.personal_mode),
      }),
      excerpt: excerptFromStoryHtml(
        typeof row.story_html === "string" ? row.story_html : "",
      ),
      fact: facts[hashString(id) % Math.max(facts.length, 1)] ?? facts[0] ?? null,
    };
  });

  return samplesToPins(samples);
}

function samplesToPins(samples: PublicStorySample[]): PinboardPin[] {
  const pins: PinboardPin[] = [];

  for (const sample of samples) {
    if (!sample.excerpt && !sample.fact) continue;
    const h = hashString(sample.id);
    const mode = h % 3;
    // 0 = excerpt, 1 = fact (fallback excerpt), 2 = both as separate pins
    if (mode === 1 && sample.fact) {
      pins.push(makePin(sample, "fact", sample.fact, h));
    } else if (sample.excerpt) {
      pins.push(makePin(sample, "excerpt", sample.excerpt, h));
      if (mode === 2 && sample.fact) {
        pins.push(makePin(sample, "fact", sample.fact, h + 17));
      }
    } else if (sample.fact) {
      pins.push(makePin(sample, "fact", sample.fact, h));
    }
  }

  return pins.slice(0, 16);
}

function makePin(
  sample: PublicStorySample,
  kind: "excerpt" | "fact",
  body: string,
  seed: number,
): PinboardPin {
  return {
    id: `${sample.id}-${kind}-${seed % 97}`,
    kind,
    title: sample.title,
    body,
    moodLabel: sample.moodLabel,
    basedOn: sample.basedOn,
    rotateDeg: (seed % 11) - 5,
    colorClass: PIN_COLORS[seed % PIN_COLORS.length]!,
    offsetX: (seed % 17) - 8,
    offsetY: ((seed * 3) % 15) - 7,
  };
}
