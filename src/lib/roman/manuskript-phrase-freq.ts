/**
 * Deterministic stock-phrase / n-gram frequency scan across Manuskript chapters.
 * Feeds Stil-Verbote into the chapter packet (not plot mustNotRepeat) and soft
 * Freigabe findings — Absicherung: „geölte Dielen/Eiche“ etc.
 *
 * Deliberately ignores dialogue tags, auxiliaries, and proper-name collocations
 * („sagte sie“, „ich habe“, „Herr Stiller“, „Apartment 204“) — those are not
 * Formulierungs-Variation targets and never shrink via Co-Autor rewrite.
 */

import { parsePlotChapters } from "@/lib/roman/plot-chapters";

export type PhraseFreqHit = {
  phrase: string;
  count: number;
  /** Chapters where the phrase appears (≥1). */
  chapterNumbers: number[];
};

const STOP = new Set([
  "und",
  "oder",
  "aber",
  "denn",
  "dass",
  "daß",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "eines",
  "ist",
  "war",
  "sind",
  "waren",
  "hat",
  "hatte",
  "haben",
  "mit",
  "auf",
  "aus",
  "bei",
  "nach",
  "von",
  "zu",
  "zum",
  "zur",
  "im",
  "in",
  "am",
  "an",
  "als",
  "wie",
  "noch",
  "schon",
  "auch",
  "nur",
  "sich",
  "nicht",
  "mehr",
  "sehr",
  "über",
  "unter",
  "vor",
  "für",
  "ohne",
  "wenn",
  "weil",
  "dann",
  "dort",
  "hier",
  "was",
  "wer",
  "wo",
  "ihm",
  "ihn",
  "ihr",
  "ihre",
  "sein",
  "seine",
  "mein",
  "dein",
]);

/** Pronouns / light verbs that form ubiquitous German collocations. */
const LIGHT_LEAD = new Set([
  "ich",
  "du",
  "er",
  "sie",
  "es",
  "wir",
  "ihr",
  "man",
  "mich",
  "dich",
  "uns",
  "euch",
]);

const LIGHT_VERB = new Set([
  "habe",
  "hast",
  "hat",
  "haben",
  "bin",
  "bist",
  "ist",
  "sind",
  "war",
  "waren",
  "hatte",
  "hatten",
  "wird",
  "wurde",
  "werden",
  "kann",
  "muss",
  "will",
  "soll",
  "darf",
  "möchte",
  "brauchen",
  "braucht",
  "sagte",
  "fragte",
  "antwortete",
  "rief",
  "meinte",
  "erwiderte",
  "flüsterte",
  "murmelte",
  "entgegnete",
  "nickte",
  "schüttelte",
  "sah",
  "blickte",
  "schaute",
  "ging",
  "kam",
  "stand",
  "saß",
  "lag",
]);

/**
 * True when the n-gram is structural prose (tags, names, auxiliaries) — not a
 * sensory/stock image worth Formulierungs-Variation.
 */
export function isStructuralCollocation(phrase: string): boolean {
  const parts = phrase
    .toLowerCase()
    .normalize("NFC")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return true;

  // „sagte sie / sagte hartmut / fragte eva“
  if (LIGHT_VERB.has(parts[0]!) && parts.length <= 3) return true;
  // „hartmut sagte / eva fragte“
  if (parts.length === 2 && LIGHT_VERB.has(parts[1]!)) return true;
  // „ich habe / er war / sie ist / brauchen wir“
  if (LIGHT_LEAD.has(parts[0]!) && LIGHT_VERB.has(parts[1]!)) return true;
  if (LIGHT_VERB.has(parts[0]!) && LIGHT_LEAD.has(parts[1]!)) return true;
  // „herr stiller / frau lenz“
  if (
    (parts[0] === "herr" || parts[0] === "frau") &&
    parts.length <= 3
  ) {
    return true;
  }
  // „apartment 204 / app 204 / wohung 12“
  if (
    /^(apartment|appartements?|app|wohnung|zimmer|raum|hausnummer)$/i.test(
      parts[0]!,
    ) &&
    /^\d+[a-z]?$/i.test(parts[1] ?? "")
  ) {
    return true;
  }
  // „kapitel anfang“-ish numbers only
  if (parts.every((p) => /^\d+$/.test(p) || STOP.has(p))) return true;

  return false;
}

function isSensoryStockPhrase(phrase: string): boolean {
  return /geölt|glänzend|dunkl|hell|rau|glatt|schwer|leicht|kalt|warm|holz|eiche|dielen|parkett|aluminium|kunststoff|teppich|fliesen|linoleum|marmor|samt|leinen|stahl|blech/.test(
    phrase,
  );
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^a-zäöüß0-9]+/i)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * Find distinctive 2–3-grams that repeat across the book (or heavily in one chapter).
 */
export function scanManuskriptPhraseFrequency(
  manuskriptText: string,
  opts?: {
    /** Min total occurrences to flag (default 3). */
    minCount?: number;
    /** Prefer phrases spanning ≥ this many chapters (default 2). */
    minChapters?: number;
    maxHits?: number;
  },
): PhraseFreqHit[] {
  const minCount = opts?.minCount ?? 3;
  const minChapters = opts?.minChapters ?? 2;
  const maxHits = opts?.maxHits ?? 24;
  const chapters = parsePlotChapters(manuskriptText).filter((c) =>
    c.body.trim(),
  );
  if (chapters.length < 1) return [];

  const global = new Map<string, { count: number; chapters: Set<number> }>();

  for (const ch of chapters) {
    // Per sentence — avoid n-grams across „Stiller. Frau …“ boundaries.
    const sentences = ch.body.split(/(?<=[.!?…])\s+/);
    const seenInChapter = new Set<string>();
    for (const sentence of sentences) {
      const tokens = tokenize(sentence);
      for (const n of [2, 3] as const) {
        for (const gram of ngrams(tokens, n)) {
          const parts = gram.split(" ");
          if (parts.every((p) => STOP.has(p))) continue;
          const row = global.get(gram) ?? { count: 0, chapters: new Set() };
          row.count += 1;
          if (!seenInChapter.has(gram)) {
            row.chapters.add(ch.number);
            seenInChapter.add(gram);
          }
          global.set(gram, row);
        }
      }
    }
  }

  const hits: PhraseFreqHit[] = [];
  for (const [phrase, row] of global) {
    if (isStructuralCollocation(phrase)) continue;
    if (row.count < minCount) continue;
    if (row.chapters.size < minChapters && row.count < minCount + 2) continue;
    // Sensory / material stock phrases (Absicherung): flag at normal threshold.
    // Other distinctive n-grams need stronger repetition (else dialogue noise).
    const sensory = isSensoryStockPhrase(phrase);
    if (!sensory) {
      if (row.count < Math.max(minCount + 3, 6)) continue;
      if (row.chapters.size < 3) continue;
    }
    hits.push({
      phrase,
      count: row.count,
      chapterNumbers: [...row.chapters].sort((a, b) => a - b),
    });
  }

  hits.sort((a, b) => {
    const as = isSensoryStockPhrase(a.phrase) ? 0 : 1;
    const bs = isSensoryStockPhrase(b.phrase) ? 0 : 1;
    return as - bs || b.count - a.count || a.phrase.localeCompare(b.phrase);
  });
  return hits.slice(0, maxHits);
}

/** Packet section: Stil-Verbote from repeated phrases (priority-friendly). */
export function formatPhraseBansForPacket(
  hits: PhraseFreqHit[],
  opts?: { excludeChapter?: number; maxLines?: number },
): string {
  const maxLines = opts?.maxLines ?? 8;
  const filtered = hits.filter((h) =>
    opts?.excludeChapter != null
      ? h.chapterNumbers.some((n) => n !== opts.excludeChapter) ||
        h.count >= 3
      : true,
  );
  if (!filtered.length) return "";
  const lines = filtered.slice(0, maxLines).map((h) => {
    const caps = h.chapterNumbers.slice(0, 6).join(", ");
    return `- NICHT wiederholen (bereits ${h.count}×, Kap. ${caps}): „${h.phrase}“ — andere Formulierung wählen`;
  });
  return `## Stil-Verbote (Wiederholungen — kein Plot-mustNotRepeat)\n${lines.join("\n")}`;
}

/** Soft Freigabe findings from phrase scan. */
export function phraseHitsToFreigabeFindings(
  hits: PhraseFreqHit[],
): Array<{
  source: "style";
  kind: "style_repeat";
  chapterNumbers: number[];
  summary: string;
  soft: true;
}> {
  return hits.slice(0, 6).map((h) => ({
    source: "style" as const,
    kind: "style_repeat",
    chapterNumbers: h.chapterNumbers.slice(0, 6),
    summary: `Stockphrase „${h.phrase}“ ${h.count}× — Formulierungs-Variation nötig.`,
    soft: true as const,
  }));
}
