/**
 * Hard contracts for Manuskript length.
 * Floors prevent short books; ceilings stop unbounded expand/Verbessern bloat.
 * Market-needs prompts are temporarily disabled (Marktanalyse rewrite pending).
 */

import {
  countWords,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";

/** Book must reach this fraction of zielWortzahlRoman after Erzeugen. */
export const MANUSKRIPT_BOOK_WORD_FLOOR_PCT = 0.9;

/** Soft ceiling: skip expand passes / stop growing once at/above this. */
export const MANUSKRIPT_BOOK_WORD_CEILING_PCT = 1.1;

/** Patch body must stay at least this fraction of the baseline chapter. */
export const MANUSKRIPT_PATCH_WORD_FLOOR_PCT = 0.95;

/** After two expands, still accept if at least this fraction of chapter min. */
export const MANUSKRIPT_CHAPTER_ACCEPT_FLOOR_PCT = 0.85;

/** Max chapters for Bedürfnis-Pass (full-book rewrite is too slow). */
export const MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS = 6;

/**
 * Per-chapter word band from book target.
 * Mins ~85% of average; max ~120% — no inflated soft ceiling that blows past Ziel.
 */
export function manuskriptWordsPerChapter(
  zielWortzahl: number | null,
  chapterCount: number,
  _szeneMax?: number | null,
): { min: number; max: number } {
  const n = Math.max(chapterCount, 1);
  if (zielWortzahl == null || zielWortzahl <= 0) {
    return { min: 400, max: 900 };
  }
  const avg = Math.round(zielWortzahl / n);
  return {
    min: Math.max(350, Math.round(avg * 0.85)),
    max: Math.max(Math.round(avg * 1.05), Math.round(avg * 1.2)),
  };
}

export function manuskriptBookWordFloor(ziel: number): number {
  return Math.round(ziel * MANUSKRIPT_BOOK_WORD_FLOOR_PCT);
}

export function manuskriptBookWordCeiling(ziel: number): number {
  return Math.round(ziel * MANUSKRIPT_BOOK_WORD_CEILING_PCT);
}

/** True when book is already at/above soft ceiling — do not expand further. */
export function manuskriptBookAtOrOverCeiling(
  words: number,
  zielWortzahl: number | null,
): boolean {
  if (zielWortzahl == null || zielWortzahl <= 0) return false;
  return words >= manuskriptBookWordCeiling(zielWortzahl);
}

/** True when book is near/over Ziel — skip Längen-Pass. */
export function manuskriptBookNearOrOverTarget(
  words: number,
  zielWortzahl: number | null,
): boolean {
  if (zielWortzahl == null || zielWortzahl <= 0) return false;
  return words >= Math.round(zielWortzahl * 0.95);
}

/**
 * Formerly injected Marktanalyse-Bedürfnisse into Erzeugen/Verbessern/Patch.
 * Temporarily always empty while Marktanalyse is reworked.
 */
export function manuskriptNeedsPromptBlock(
  _editorial: RomanEditorial | null | undefined,
): string {
  return "";
}

export function manuskriptChapterWordCount(body: string): number {
  return countWords(body);
}

export function manuskriptChaptersUnderMin(
  manuskriptText: string,
  minWords: number,
): number[] {
  return parsePlotChapters(manuskriptText)
    .filter((c) => manuskriptChapterWordCount(c.body) < minWords)
    .map((c) => c.number);
}

export function manuskriptChaptersOverMax(
  manuskriptText: string,
  maxWords: number,
): number[] {
  return parsePlotChapters(manuskriptText)
    .filter((c) => manuskriptChapterWordCount(c.body) > maxWords)
    .map((c) => c.number);
}

/** German one-liner for toasts / history. */
export function formatManuskriptWordMetrics(input: {
  words: number;
  zielWortzahl: number | null;
  chaptersUnderMin?: number[];
}): string {
  const ziel =
    input.zielWortzahl != null && input.zielWortzahl > 0
      ? input.zielWortzahl
      : null;
  const base =
    ziel != null
      ? `Wörter ${input.words.toLocaleString("de-DE")} / Ziel ${ziel.toLocaleString("de-DE")} (${Math.round((input.words / ziel) * 100)}%)`
      : `Wörter ${input.words.toLocaleString("de-DE")}`;
  const under = input.chaptersUnderMin ?? [];
  if (under.length === 0) return base;
  return `${base} · unter Min: Kap. ${under.join(", ")}`;
}
