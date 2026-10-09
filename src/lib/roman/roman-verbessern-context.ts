/**
 * Stable context for Roman Verbessern (Claude Batch / Opus Stil-Pass).
 * Cross-chapter voice anchor + Regeln/Tonalität — byte-stable across chapters
 * in one batch so Anthropic prompt-cache (1h) can reuse the prefix.
 */

import {
  formatRichtungenLabel,
  normalizeRichtungen,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import type { PlotChapter } from "@/lib/roman/plot-chapters";
import type { RomanKontext } from "@/lib/roman/types";

const ANCHOR_CHAPTER_CHARS = 1_400;
const TON_CHARS = 1_800;
const REGELN_CHARS = 2_400;
const STILBIBEL_CHARS = 1_200;
const KI_REGELN_CHARS = 1_000;

function clipBody(body: string, maxChars: number): string {
  const t = body.replace(/\r\n/g, "\n").trim();
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.55);
  const tail = maxChars - head - 20;
  return `${t.slice(0, head).trim()}\n\n[…]\n\n${t.slice(-tail).trim()}`;
}

/**
 * Pick two longest chapters among the first four filled — avoids anchoring on
 * a thin Kap. 1 when Kap. 2–3 already carry the real book voice.
 * Pass `preferred` (e.g. polished Wave-1 chapters) to lock the anchor explicitly.
 */
export function selectStyleAnchorChapters(
  chapters: PlotChapter[],
  preferred?: PlotChapter[],
): PlotChapter[] {
  if (preferred?.length) {
    const filled = preferred.filter((c) => c.body.trim().length >= 80);
    if (filled.length >= 1) return filled.slice(0, 2);
  }
  const filled = chapters.filter((c) => c.body.trim().length >= 80);
  if (filled.length === 0) return [];
  const pool = filled.slice(0, Math.min(4, filled.length));
  return [...pool]
    .sort((a, b) => b.body.trim().length - a.body.trim().length)
    .slice(0, 2)
    .sort((a, b) => a.number - b.number);
}

/**
 * Sample voice/register anchor for batch chapters — content-frozen polish must
 * stay in the same book voice. Prefer polished Wave-1 chapters when provided.
 */
export function buildCrossChapterStyleAnchor(
  manuskriptChapters: PlotChapter[],
  preferred?: PlotChapter[],
): string {
  const samples = selectStyleAnchorChapters(manuskriptChapters, preferred);
  if (samples.length === 0) {
    return `# Cross-Chapter-Stilanker
(noch keine Manuskript-Kapitel — Stimme aus Tonalität/Regeln ableiten)`;
  }
  const blocks = samples.map((ch) => {
    const title = ch.title.trim() || `Kapitel ${ch.number}`;
    return `## Anker Kap. ${ch.number} — ${title}
${clipBody(ch.body, ANCHOR_CHAPTER_CHARS)}`;
  });

  return `# Cross-Chapter-Stilanker (MUSS — Stimme/Register über Kapitelgrenzen)
Gleiche Erzählstimme, gleiches Register, vergleichbarer Satzrhythmus wie in diesen Anker-Kapiteln.
Nicht kopieren/paraphrasieren — nur als Maßstab für Wortwahl und Ton. Inhalt der Zielkapitel bleibt eingefroren.

${blocks.join("\n\n")}`.trim();
}

/**
 * Regeln + Tonalität + optional Stilbibel / KI-Regelwerk for Opus Stil-Pass.
 */
export function buildVerbessernRulesAndTone(input: {
  roman: Pick<
    RomanKontext,
    "tonalitaet" | "stilbibel" | "kiRegelwerk" | "genre"
  >;
  editorial: RomanEditorial;
}): string {
  const ton = (input.roman.tonalitaet ?? "").trim();
  const stilbibel = (input.roman.stilbibel ?? "").trim();
  const ki = (input.roman.kiRegelwerk ?? "").trim();
  const grob = (input.editorial.grobRegeln ?? "").trim();
  const harte = (input.editorial.harteRegeln ?? [])
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 16);
  const richtungen = normalizeRichtungen(input.editorial.richtungen);
  const genre = (input.roman.genre ?? "").trim();

  const parts: string[] = [
    `# Sprache & Tonalität (MUSS — in jedem Kapitel spürbar)
Genre: ${genre || "—"}
${ton.slice(0, TON_CHARS) || "(Tonalität leer — aus Genre/Spec ableiten, aber konsistent bleiben)"}`,
  ];

  if (richtungen.length) {
    parts.push(
      `# Leserversprechen / Richtung (MUSS nicht brechen)
${formatRichtungenLabel(richtungen)}`,
    );
  }

  const regelLines: string[] = [];
  if (grob) {
    regelLines.push(`Basis-Regeln:\n${grob.slice(0, REGELN_CHARS)}`);
  }
  if (harte.length) {
    regelLines.push(
      `Harte Verlagsregeln:\n${harte.map((r) => `– ${r}`).join("\n")}`,
    );
  }
  if (ki) {
    regelLines.push(`KI-Regelwerk:\n${ki.slice(0, KI_REGELN_CHARS)}`);
  }
  parts.push(
    `# Regeln (MUSS einhalten — Stil-Pass ändert Inhalt nicht, darf Regeln nicht verletzen)
${regelLines.join("\n\n") || "(keine expliziten Regeln hinterlegt)"}`,
  );

  if (stilbibel.length >= 40) {
    parts.push(
      `# Stilbibel (Orientierung)
${stilbibel.slice(0, STILBIBEL_CHARS)}`,
    );
  }

  return parts.join("\n\n").trim();
}

/**
 * Cacheable prefix addendum for Verbessern batches (after slim canon).
 */
export function buildVerbessernCacheableExtras(input: {
  roman: Pick<
    RomanKontext,
    "tonalitaet" | "stilbibel" | "kiRegelwerk" | "genre"
  >;
  editorial: RomanEditorial;
  manuskriptChapters: PlotChapter[];
  /** Prefer these chapters as Stilanker (e.g. polished Wave 1). */
  preferredAnchorChapters?: PlotChapter[];
}): string {
  return [
    buildVerbessernRulesAndTone({
      roman: input.roman,
      editorial: input.editorial,
    }),
    buildCrossChapterStyleAnchor(
      input.manuskriptChapters,
      input.preferredAnchorChapters,
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
