/**
 * Hörbuch multi-cast: split chapter prose into narrator / dialogue turns,
 * map speakers to ElevenLabs voice ids, batch for Text-to-Dialogue (≤2k chars).
 */

import type { RomanCharakter } from "@/lib/roman/types";

/** Fixed casting keys (not character names). */
export const ROMAN_HOERBUCH_NARRATOR_KEY = "narrator";
export const ROMAN_HOERBUCH_UNKNOWN_KEY = "unknown";

/** ElevenLabs Text-to-Dialogue hard limit on unique voice_ids. */
export const ROMAN_HOERBUCH_MAX_VOICES = 10;

/** Reliable per-request budget for dialogue inputs (docs). */
export const MAX_DIALOGUE_CHARS_PER_REQUEST = 1_900;

export type RomanHoerbuchSpeakerKey = string;

export type RomanHoerbuchCasting = Record<RomanHoerbuchSpeakerKey, string>;

export type RomanHoerbuchDialogueTurn = {
  speakerKey: RomanHoerbuchSpeakerKey;
  text: string;
};

export type RomanHoerbuchDialogueInput = {
  text: string;
  voiceId: string;
};

const SPEECH_VERBS =
  "sagte|fragte|rief|antwortete|flüsterte|meinte|erwiderte|schrie|murmelte|entgegnete|seufzte|keuchte|lachte|grinste|brummte|fauchte|jammerte|stöhnte|prahlte|beteuerte|erklärte|berichtete|erzählte|gab zurück|warf ein|fiel ein";

const ATTR_AFTER_RE = new RegExp(
  `^\\s*[,.]?\\s*(?:${SPEECH_VERBS})\\s+([A-ZÄÖÜ][\\wÄÖÜäöüß.'\\-]{1,40}(?:\\s+[A-ZÄÖÜ][\\wÄÖÜäöüß.'\\-]{1,40})?)`,
  "i",
);

const ATTR_BEFORE_RE = new RegExp(
  `([A-ZÄÖÜ][\\wÄÖÜäöüß.'\\-]{1,40}(?:\\s+[A-ZÄÖÜ][\\wÄÖÜäöüß.'\\-]{1,40})?)\\s*(?:${SPEECH_VERBS})\\s*:\\s*$`,
  "i",
);

const ATTR_COLON_RE =
  /([A-ZÄÖÜ][\wÄÖÜäöüß.'\-]{1,40}(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß.'\-]{1,40})?)\s*:\s*$/;

type CharacterAlias = {
  key: string;
  /** Lowercase aliases sorted longest-first for matching. */
  aliases: string[];
};

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Stable speaker key for a character row (display name, trimmed).
 */
export function romanHoerbuchCharacterKey(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Casting rows shown in Export UI: narrator, known characters, unknown dialogue.
 */
export function listRomanHoerbuchCastingRoles(
  charaktere: RomanCharakter[],
): Array<{ key: string; label: string; hint?: string }> {
  const seen = new Set<string>();
  const roles: Array<{ key: string; label: string; hint?: string }> = [
    {
      key: ROMAN_HOERBUCH_NARRATOR_KEY,
      label: "Erzähler",
      hint: "Erzähltext / Bühnenanweisungen",
    },
  ];
  for (const c of charaktere) {
    const key = romanHoerbuchCharacterKey(c.name);
    if (!key || seen.has(normalizeName(key))) continue;
    seen.add(normalizeName(key));
    const rolle = c.rolle?.trim();
    roles.push({
      key,
      label: key,
      hint: rolle || undefined,
    });
  }
  roles.push({
    key: ROMAN_HOERBUCH_UNKNOWN_KEY,
    label: "Unbekannte Dialoge",
    hint: "Zitate ohne zuordenbare Figur",
  });
  return roles;
}

function buildCharacterAliases(charaktere: RomanCharakter[]): CharacterAlias[] {
  const out: CharacterAlias[] = [];
  for (const c of charaktere) {
    const key = romanHoerbuchCharacterKey(c.name);
    if (!key) continue;
    const aliases = new Set<string>();
    aliases.add(normalizeName(key));
    const parts = key.split(/\s+/).filter(Boolean);
    if (parts[0] && parts[0].length >= 2) {
      aliases.add(normalizeName(parts[0]));
    }
    if (parts.length > 1) {
      const last = parts[parts.length - 1]!;
      if (last.length >= 3) aliases.add(normalizeName(last));
    }
    out.push({
      key,
      aliases: [...aliases].sort((a, b) => b.length - a.length),
    });
  }
  return out;
}

function matchSpeakerName(
  rawName: string,
  aliases: CharacterAlias[],
): string | null {
  const needle = normalizeName(rawName);
  if (!needle) return null;
  for (const entry of aliases) {
    for (const alias of entry.aliases) {
      if (needle === alias || needle.startsWith(`${alias} `)) {
        return entry.key;
      }
    }
  }
  return null;
}

type Segment =
  | { kind: "narration"; text: string }
  | { kind: "dialogue"; text: string; open: string; close: string; index: number; end: number };

/**
 * Split prose into narration vs quoted dialogue (German typographic quotes).
 */
export function splitProseIntoQuoteSegments(text: string): Segment[] {
  const src = text.replace(/\r\n/g, "\n");
  const segments: Segment[] = [];
  let i = 0;
  let narrationStart = 0;

  const pushNarration = (end: number) => {
    const chunk = src.slice(narrationStart, end).trim();
    if (chunk) segments.push({ kind: "narration", text: chunk });
  };

  while (i < src.length) {
    const ch = src[i]!;
    const contentStart = i + 1;
    let closeIdx = -1;
    let close = "";

    if (ch === "„") {
      // German: „…“ or „…”
      const a = src.indexOf("“", contentStart);
      const b = src.indexOf("”", contentStart);
      if (a >= 0 && (b < 0 || a <= b)) {
        closeIdx = a;
        close = "“";
      } else if (b >= 0) {
        closeIdx = b;
        close = "”";
      }
    } else if (ch === "»") {
      closeIdx = src.indexOf("«", contentStart);
      close = "«";
    } else if (ch === '"') {
      closeIdx = src.indexOf('"', contentStart);
      close = '"';
    } else if (ch === "“") {
      closeIdx = src.indexOf("”", contentStart);
      close = "”";
    }

    if (closeIdx < 0) {
      i += 1;
      continue;
    }

    const open = ch;

    pushNarration(i);
    const dialogue = src.slice(contentStart, closeIdx).trim();
    if (dialogue) {
      segments.push({
        kind: "dialogue",
        text: dialogue,
        open,
        close,
        index: i,
        end: closeIdx + close.length,
      });
    }
    i = closeIdx + close.length;
    narrationStart = i;
  }

  pushNarration(src.length);
  return segments;
}

function findNameInWindow(
  window: string,
  aliases: CharacterAlias[],
): string | null {
  const lower = normalizeName(window);
  let best: { key: string; len: number; index: number } | null = null;
  for (const entry of aliases) {
    for (const alias of entry.aliases) {
      if (alias.length < 2) continue;
      const index = lower.indexOf(alias);
      if (index < 0) continue;
      // Prefer earlier mention, then longer alias (full name over first name).
      if (
        !best ||
        index < best.index ||
        (index === best.index && alias.length > best.len)
      ) {
        best = { key: entry.key, len: alias.length, index };
      }
    }
  }
  return best?.key ?? null;
}

function inferDialogueSpeaker(input: {
  before: string;
  after: string;
  aliases: CharacterAlias[];
  lastDialogueSpeaker: string | null;
}): string {
  const beforeTail = input.before.slice(-160);
  const afterHead = input.after.slice(0, 160);

  const beforeMatch =
    beforeTail.match(ATTR_BEFORE_RE) ?? beforeTail.match(ATTR_COLON_RE);
  if (beforeMatch?.[1]) {
    const key = matchSpeakerName(beforeMatch[1], input.aliases);
    if (key) return key;
  }

  const afterMatch = afterHead.match(ATTR_AFTER_RE);
  if (afterMatch?.[1]) {
    const key = matchSpeakerName(afterMatch[1], input.aliases);
    if (key) return key;
  }

  // Verb attribution missed: prefer a name in the *after* clause (sagte X),
  // then before, then last speaker.
  const afterName = findNameInWindow(afterHead.slice(0, 80), input.aliases);
  if (afterName) return afterName;

  const beforeName = findNameInWindow(beforeTail.slice(-80), input.aliases);
  if (beforeName) return beforeName;

  return input.lastDialogueSpeaker ?? ROMAN_HOERBUCH_UNKNOWN_KEY;
}

/**
 * Turn spoken chapter text into ordered speaker turns for casting.
 */
export function splitChapterIntoDialogueTurns(input: {
  spokenText: string;
  charaktere: RomanCharakter[];
}): RomanHoerbuchDialogueTurn[] {
  const aliases = buildCharacterAliases(input.charaktere);
  const segments = splitProseIntoQuoteSegments(input.spokenText);
  const turns: RomanHoerbuchDialogueTurn[] = [];
  let lastDialogueSpeaker: string | null = null;

  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s]!;
    if (seg.kind === "narration") {
      turns.push({
        speakerKey: ROMAN_HOERBUCH_NARRATOR_KEY,
        text: seg.text,
      });
      continue;
    }

    // Prefer the narration immediately around this quote (attribution lives there).
    const prevNarration = [...segments.slice(0, s)]
      .reverse()
      .find((x): x is Extract<Segment, { kind: "narration" }> => x.kind === "narration");
    const nextNarration = segments
      .slice(s + 1)
      .find((x): x is Extract<Segment, { kind: "narration" }> => x.kind === "narration");

    const speakerKey = inferDialogueSpeaker({
      before: prevNarration?.text ?? "",
      after: nextNarration?.text ?? "",
      aliases,
      lastDialogueSpeaker,
    });
    lastDialogueSpeaker =
      speakerKey === ROMAN_HOERBUCH_UNKNOWN_KEY
        ? lastDialogueSpeaker
        : speakerKey;

    turns.push({ speakerKey, text: seg.text });
  }

  return mergeAdjacentTurns(turns);
}

function mergeAdjacentTurns(
  turns: RomanHoerbuchDialogueTurn[],
): RomanHoerbuchDialogueTurn[] {
  const out: RomanHoerbuchDialogueTurn[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.speakerKey === turn.speakerKey) {
      prev.text = `${prev.text} ${text}`.replace(/\s+/g, " ").trim();
    } else {
      out.push({ speakerKey: turn.speakerKey, text });
    }
  }
  return out;
}

/**
 * Resolve turns → dialogue API inputs; missing cast falls back to narrator voice.
 */
export function mapTurnsToDialogueInputs(
  turns: RomanHoerbuchDialogueTurn[],
  casting: RomanHoerbuchCasting,
): RomanHoerbuchDialogueInput[] {
  const narratorVoice =
    casting[ROMAN_HOERBUCH_NARRATOR_KEY]?.trim() ||
    casting[ROMAN_HOERBUCH_UNKNOWN_KEY]?.trim() ||
    "";
  if (!narratorVoice) {
    throw new Error("Erzähler-Stimme fehlt im Casting.");
  }

  const out: RomanHoerbuchDialogueInput[] = [];
  for (const turn of turns) {
    const voiceId =
      casting[turn.speakerKey]?.trim() ||
      casting[ROMAN_HOERBUCH_UNKNOWN_KEY]?.trim() ||
      narratorVoice;
    out.push({ text: turn.text, voiceId });
  }
  return mergeAdjacentDialogueInputs(out);
}

function mergeAdjacentDialogueInputs(
  inputs: RomanHoerbuchDialogueInput[],
): RomanHoerbuchDialogueInput[] {
  const out: RomanHoerbuchDialogueInput[] = [];
  for (const item of inputs) {
    const text = item.text.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.voiceId === item.voiceId) {
      prev.text = `${prev.text} ${text}`.replace(/\s+/g, " ").trim();
    } else {
      out.push({ text, voiceId: item.voiceId });
    }
  }
  return out;
}

/**
 * Split a long single-speaker string so each piece stays under maxChars.
 */
function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?…])\s+/);
  let buf = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      if (buf) {
        parts.push(buf);
        buf = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        parts.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length > maxChars) {
      if (buf) parts.push(buf);
      buf = sentence;
    } else {
      buf = next;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/**
 * Pack dialogue inputs into request batches (char + continuity friendly).
 */
export function batchDialogueInputs(
  inputs: RomanHoerbuchDialogueInput[],
  maxChars = MAX_DIALOGUE_CHARS_PER_REQUEST,
): RomanHoerbuchDialogueInput[][] {
  const flat: RomanHoerbuchDialogueInput[] = [];
  for (const item of inputs) {
    for (const piece of splitLongText(item.text, maxChars)) {
      flat.push({ text: piece, voiceId: item.voiceId });
    }
  }

  const batches: RomanHoerbuchDialogueInput[][] = [];
  let current: RomanHoerbuchDialogueInput[] = [];
  let chars = 0;

  for (const item of flat) {
    const add = item.text.length;
    if (current.length > 0 && chars + add > maxChars) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += add;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Validate casting: narrator required, ≤10 unique voices, voice ids non-empty.
 */
export function validateRomanHoerbuchCasting(
  casting: RomanHoerbuchCasting,
  roleKeys: string[],
): string | null {
  const narrator = casting[ROMAN_HOERBUCH_NARRATOR_KEY]?.trim();
  if (!narrator) return "Bitte eine Erzähler-Stimme wählen.";

  const used = new Set<string>();
  for (const key of roleKeys) {
    const voice = casting[key]?.trim();
    if (!voice) {
      if (key === ROMAN_HOERBUCH_NARRATOR_KEY) {
        return "Bitte eine Erzähler-Stimme wählen.";
      }
      continue;
    }
    used.add(voice);
  }
  if (used.size > ROMAN_HOERBUCH_MAX_VOICES) {
    return `ElevenLabs erlaubt max. ${ROMAN_HOERBUCH_MAX_VOICES} verschiedene Stimmen pro Hörbuch.`;
  }
  return null;
}

/**
 * Count unique speakers that appear as dialogue (excl. narrator) in turns.
 */
export function countDialogueSpeakers(
  turns: RomanHoerbuchDialogueTurn[],
): number {
  const keys = new Set(
    turns
      .map((t) => t.speakerKey)
      .filter(
        (k) =>
          k !== ROMAN_HOERBUCH_NARRATOR_KEY &&
          k !== ROMAN_HOERBUCH_UNKNOWN_KEY,
      ),
  );
  return keys.size;
}
