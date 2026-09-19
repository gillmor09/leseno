/**
 * Chapter / section structure guards — headings must survive AI apply.
 */

import {
  formatChapterHeading,
  formatManuskriptChapterHeading,
  parsePlotChapters,
  sanitizeChapterTitle,
  serializeManuskriptChapters,
  serializePlotChapters,
  stripLeadingChapterHeadings,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";

export type ChapterDocFormat = "plot" | "manuskript";

export type StructureGuardResult =
  | { ok: true; text: string; chapters: PlotChapter[] }
  | { ok: false; error: string; text: string };

/**
 * Reassemble plot/manuscript from chapters; bodies must not contain headings.
 */
export function assembleGuardedChapters(
  chapters: PlotChapter[],
  format: ChapterDocFormat = "plot",
): string {
  const cleaned = chapters.map((c) => ({
    ...c,
    body: stripLeadingChapterHeadings(c.body, c.number),
    title: sanitizeChapterTitle(c.title, c.number),
  }));
  return format === "manuskript"
    ? serializeManuskriptChapters(cleaned)
    : serializePlotChapters(cleaned);
}

/**
 * Validate that `candidate` keeps the same chapter numbers as `baseline`.
 * Titles may change only when `allowTitleChange` is true.
 */
export function assertChapterStructure(
  baseline: string,
  candidate: string,
  options?: {
    allowTitleChange?: boolean;
    minChapters?: number;
    format?: ChapterDocFormat;
  },
): StructureGuardResult {
  const format = options?.format ?? "plot";
  const before = parsePlotChapters(baseline);
  const after = parsePlotChapters(candidate);
  const min = options?.minChapters ?? 2;

  if (before.length >= min && after.length < min) {
    return {
      ok: false,
      error: `Kapitelstruktur verloren (${before.length} → ${after.length}). Änderung verworfen.`,
      text: baseline,
    };
  }

  if (before.length >= min && after.length !== before.length) {
    return {
      ok: false,
      error: `Kapitelanzahl geändert (${before.length} → ${after.length}). Änderung verworfen.`,
      text: baseline,
    };
  }

  if (before.length >= min) {
    for (let i = 0; i < before.length; i += 1) {
      const b = before[i]!;
      const a = after[i]!;
      if (a.number !== b.number) {
        return {
          ok: false,
          error: `Kapitelnummer verschoben (${b.number} → ${a.number}). Änderung verworfen.`,
          text: baseline,
        };
      }
      if (!options?.allowTitleChange && a.title !== b.title) {
        // Restore baseline titles, keep new bodies if numbers match.
        after[i] = { ...a, title: b.title };
      }
    }
    const text = assembleGuardedChapters(after, format);
    return { ok: true, text, chapters: parsePlotChapters(text) };
  }

  // Baseline had no chapters — accept candidate as-is (or empty).
  return {
    ok: true,
    text: candidate.trim() || baseline,
    chapters: after,
  };
}

/**
 * Apply body patches by chapter number; headings come only from baseline meta.
 */
export function patchChapterBodies(
  baseline: string,
  patches: Array<{ chapterNumber: number; body: string }>,
  format: ChapterDocFormat = "plot",
): StructureGuardResult {
  const chapters = parsePlotChapters(baseline);
  if (chapters.length < 1) {
    return {
      ok: false,
      error: "Keine Kapitel zum Patchen — bitte Struktur zuerst erzeugen.",
      text: baseline,
    };
  }

  const byNum = new Map(chapters.map((c) => [c.number, c]));
  for (const patch of patches) {
    const current = byNum.get(patch.chapterNumber);
    if (!current) {
      return {
        ok: false,
        error: `Kapitel ${patch.chapterNumber} fehlt in der Baseline.`,
        text: baseline,
      };
    }
    byNum.set(patch.chapterNumber, {
      ...current,
      body: stripLeadingChapterHeadings(patch.body, patch.chapterNumber),
    });
  }

  const next = chapters.map((c) => byNum.get(c.number)!);
  const text = assembleGuardedChapters(next, format);
  return assertChapterStructure(baseline, text, {
    allowTitleChange: false,
    format,
  });
}

/** Ensure a single chapter block starts with the canonical heading. */
export function ensureChapterHeading(
  chapter: PlotChapter,
  bodyOrFull: string,
  format: ChapterDocFormat = "plot",
): string {
  const body = stripLeadingChapterHeadings(bodyOrFull, chapter.number);
  const heading =
    format === "manuskript"
      ? formatManuskriptChapterHeading(chapter)
      : formatChapterHeading(chapter);
  if (!body) return heading;
  return format === "manuskript"
    ? `${heading}\n\n${body}`
    : `${heading}\n${body}`;
}
