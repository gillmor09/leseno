/**
 * Pure Manuskript retitle helper (Thema = source of truth).
 * Kept free of AI imports for client webpack bundles.
 */

import type { CleverUnterthemen } from "@/lib/roman/editorial";
import {
  parsePlotChapters,
  sanitizeChapterTitle,
  serializeManuskriptChapters,
} from "@/lib/roman/plot-chapters";

/**
 * Force Manuskript chapter headings to match Unterthemen titles (Thema = SoT).
 * Keeps story bodies; only retitles. No-op when there is no prose or no Kapitel.
 */
export function applyCleverThemaTitlesToManuskript(
  manuskriptText: string,
  unterthemen: CleverUnterthemen | null | undefined,
): string {
  const doc = unterthemen;
  if (!doc?.kapitel.length) return manuskriptText;
  const text = manuskriptText.trim();
  if (!text) return manuskriptText;

  const chapters = parsePlotChapters(text);
  if (chapters.length < 1) return manuskriptText;

  const byNum = new Map(
    doc.kapitel.map((k) => [k.nummer, k.titel.trim()] as const),
  );
  let changed = false;
  const next = chapters.map((c) => {
    const thema = byNum.get(c.number);
    if (!thema) return c;
    const title = sanitizeChapterTitle(thema, c.number) || c.title;
    if (title !== c.title) changed = true;
    return { ...c, title };
  });
  return changed ? serializeManuskriptChapters(next) : manuskriptText;
}
