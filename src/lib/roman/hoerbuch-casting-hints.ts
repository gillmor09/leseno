/**
 * Preferred Hörbuch casting from ElevenLabs Studio screenshot (Beckmann cast)
 * + helpers to match role keys → voice ids (search / known ids / local list).
 */

import type { TtsVoiceOption } from "@/lib/ai/tts-voices";
import {
  ROMAN_HOERBUCH_NARRATOR_KEY,
  type RomanHoerbuchCasting,
} from "@/lib/roman/hoerbuch-dialogue";

export type HoerbuchVoiceHint = {
  /** Human label (matches ElevenLabs Voice Library title). */
  voiceLabel: string;
  /** Match casting role keys (character display names / narrator). */
  roleMatchers: RegExp[];
  /** Queries for `GET /v1/shared-voices?search=`. */
  searchQueries: string[];
  /** Prefer voices whose label/description contains these (lowercase). */
  labelIncludes: string[];
  /** Stable fallback voice id when search is unavailable. */
  knownVoiceId?: string;
};

/**
 * Cast from the user's ElevenLabs Studio screenshot:
 * Narrator→Jantosch, Tobias→Leo liest, Karsten→Lennart, …
 */
export const HOERBUCH_SCREENSHOT_VOICE_HINTS: readonly HoerbuchVoiceHint[] = [
  {
    voiceLabel: "Lucius - Engaging and Dramatic",
    roleMatchers: [/^narrator$/i],
    searchQueries: ["Lucius Engaging", "Lucius Deep"],
    labelIncludes: ["lucius - engaiging", "lucius - engaging", "lucius"],
    /** Deep German storyteller — user-chosen Erzähler. */
    knownVoiceId: "ekJ0doQ5Wa25P7W5HCj7",
  },
  {
    voiceLabel: "Leo liest (ruhig)",
    roleMatchers: [/^tobias(\s+beckmann)?$/i],
    searchQueries: ["Leo liest ruhig", "Leo liest"],
    labelIncludes: ["leo liest (ruhig)", "leo liest"],
    knownVoiceId: "neSsqAiYj0KThbslcqPj",
  },
  {
    voiceLabel: "Lennart - Energetic",
    roleMatchers: [/^karsten(\s+brinkmann)?$/i],
    searchQueries: ["Lennart Energetic", "Lennart"],
    labelIncludes: ["lennart - energetic", "lennart energetic", "lennart"],
    knownVoiceId: "GoXyzBapJk3AoCJoMQl9",
  },
  {
    voiceLabel: "Emilia - Sweet German Soul",
    roleMatchers: [/^isabella(\s+conti)?$/i],
    searchQueries: ["Emilia Sweet German"],
    labelIncludes: ["emilia - sweet german", "emilia"],
    knownVoiceId: "ghgFyr7gmpr57xyTgX9q",
  },
  {
    voiceLabel: "Torsten - Raspy Charmer",
    roleMatchers: [/^jannis(\s+beckmann)?$/i],
    searchQueries: ["Torsten Raspy Charmer", "Torsten Raspy"],
    labelIncludes: ["torsten - raspy", "torsten raspy", "torsten"],
  },
  {
    voiceLabel: "Rebecca Green - Calm and Articulate",
    roleMatchers: [/^melanie(\s+beckmann)?$/i],
    searchQueries: ["Rebecca Green Calm"],
    labelIncludes: ["rebecca green - calm", "rebecca green"],
    knownVoiceId: "oNs4CSS4LR7hEoEykuS5",
  },
  {
    voiceLabel: "The Voice of Gad - By The Pharaoh",
    /** Ulf Behrens — often only „der Nachbar“ in prose (role alias). */
    roleMatchers: [/^ulf(\s+behrens)?$/i, /^nachbar(in)?$/i],
    searchQueries: ["Voice of Gad", "The Voice of Gad"],
    labelIncludes: ["voice of gad", "gad"],
  },
] as const;

/** Seed the voice picker so screenshot voices appear even before shared search. */
export const HOERBUCH_SCREENSHOT_VOICE_OPTIONS: readonly TtsVoiceOption[] = [
  {
    id: "ekJ0doQ5Wa25P7W5HCj7",
    label: "Lucius - Engaging and Dramatic",
    description: "Hörbuch-Preset · Erzähler (Deep Storyteller)",
  },
  {
    id: "CVcPLXStXPeDxhrSflDZ",
    label: "Jantosch – Inspiring Live Voice",
    description: "Hörbuch-Preset · alternativ",
  },
  {
    id: "neSsqAiYj0KThbslcqPj",
    label: "Leo liest",
    description: "Hörbuch-Preset · ruhig / warm",
  },
  {
    id: "GoXyzBapJk3AoCJoMQl9",
    label: "Lennart - Casual & Light",
    description: "Hörbuch-Preset · nahe Lennart Energetic",
  },
  {
    id: "ghgFyr7gmpr57xyTgX9q",
    label: "Emilia - Sweet German Soul",
    description: "Hörbuch-Preset",
  },
  {
    id: "oNs4CSS4LR7hEoEykuS5",
    label: "Rebecca Green - Calm and Articulate",
    description: "Hörbuch-Preset",
  },
];

function normalize(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hintForRoleKey(roleKey: string): HoerbuchVoiceHint | null {
  const key = roleKey.trim();
  if (!key) return null;
  if (key === ROMAN_HOERBUCH_NARRATOR_KEY) {
    return HOERBUCH_SCREENSHOT_VOICE_HINTS[0] ?? null;
  }
  for (const hint of HOERBUCH_SCREENSHOT_VOICE_HINTS) {
    if (hint.roleMatchers.some((re) => re.test(key))) return hint;
  }
  return null;
}

/**
 * Score how well a voice option matches a hint (higher = better).
 */
export function scoreVoiceAgainstHint(
  voice: TtsVoiceOption,
  hint: HoerbuchVoiceHint,
): number {
  const hay = normalize(`${voice.label} ${voice.description ?? ""}`);
  let score = 0;
  for (const needle of hint.labelIncludes) {
    const n = normalize(needle);
    if (!n) continue;
    if (hay === n) score += 100;
    else if (hay.includes(n)) score += 40 + Math.min(20, n.length);
  }
  if (hint.knownVoiceId && voice.id === hint.knownVoiceId) score += 80;
  return score;
}

/** Best matching voice from a local list, or null. */
export function pickVoiceForHint(
  voices: TtsVoiceOption[],
  hint: HoerbuchVoiceHint,
): TtsVoiceOption | null {
  let best: TtsVoiceOption | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const score = scoreVoiceAgainstHint(voice, hint);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  if (best && bestScore >= 40) return best;
  if (hint.knownVoiceId) {
    const known =
      voices.find((v) => v.id === hint.knownVoiceId) ??
      ({
        id: hint.knownVoiceId,
        label: hint.voiceLabel,
        description: "Hörbuch-Preset",
      } satisfies TtsVoiceOption);
    return known;
  }
  return bestScore > 0 ? best : null;
}

/**
 * Build casting map for the given role keys from a voice list + screenshot hints.
 * Roles without a hint are left unchanged (not in the returned map).
 */
export function castingFromScreenshotHints(
  roleKeys: string[],
  voices: TtsVoiceOption[],
): {
  casting: RomanHoerbuchCasting;
  matched: Array<{ roleKey: string; voiceLabel: string; voiceId: string }>;
  missing: string[];
} {
  const casting: RomanHoerbuchCasting = {};
  const matched: Array<{
    roleKey: string;
    voiceLabel: string;
    voiceId: string;
  }> = [];
  const missing: string[] = [];

  for (const roleKey of roleKeys) {
    const hint = hintForRoleKey(roleKey);
    if (!hint) continue;
    const voice = pickVoiceForHint(voices, hint);
    if (!voice?.id) {
      missing.push(roleKey);
      continue;
    }
    casting[roleKey] = voice.id;
    matched.push({
      roleKey,
      voiceLabel: voice.label || hint.voiceLabel,
      voiceId: voice.id,
    });
  }

  return { casting, matched, missing };
}

export function hintSearchQueries(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const hint of HOERBUCH_SCREENSHOT_VOICE_HINTS) {
    for (const q of hint.searchQueries) {
      const key = normalize(q);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}
