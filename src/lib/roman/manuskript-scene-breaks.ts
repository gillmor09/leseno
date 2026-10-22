/**
 * Retrofit print-style scene breaks (`* * *`) into Manuskript prose at
 * Szenenplot scene boundaries. New drafts emit the same marker via
 * `MANUSKRIPT_SCENE_BREAK_HINT` in `plot-chapters.ts`.
 *
 * Export: EPUB/PDF center the marker; Hörbuch drops it (paragraph pause remains).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import { countWords, emptyRomanEditorial } from "@/lib/roman/editorial";
import {
  countSceneBreaks,
  parsePlotChapters,
  replaceManuskriptChapterBody,
  SCENE_BREAK_MARKER,
  serializeManuskriptChapters,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import type { RomanSzenenplotScene } from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

const INSERT_CONCURRENCY = 3;
const MAX_CHAPTER_CHARS = 60_000;
const WORD_DRIFT_RATIO = 0.08;

/**
 * Normalize tolerant break variants (`***`, `⁂`, `~ ~ ~`) to the print marker.
 */
export function normalizeSceneBreakMarkers(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      /^\s*(?:\*\s*\*\s*\*|\*\*\*|⁂|~\s*~\s*~)\s*$/.test(line)
        ? SCENE_BREAK_MARKER
        : line,
    )
    .join("\n");
}

export function expectedSceneBreakCount(plannedScenes: number): number {
  return Math.max(0, Math.floor(plannedScenes) - 1);
}

/** True when the chapter has at least two planned scenes but fewer breaks. */
export function chapterMissingSceneBreaks(
  body: string,
  plannedScenes: number,
): boolean {
  return (
    plannedScenes >= 2 &&
    countSceneBreaks(body) < expectedSceneBreakCount(plannedScenes)
  );
}

/** Packet / prompt mandate when a chapter has 2+ planned scenes. */
export function formatSceneBreakMandate(plannedScenes: number): string {
  const n = expectedSceneBreakCount(plannedScenes);
  if (n < 1) return "";
  return `## Szenentrenner (verbindlich)
Dieses Kapitel hat ${plannedScenes} geplante Szenen — setze genau ${n} eigene Absätze \`${SCENE_BREAK_MARKER}\` an den Szenenwechseln (Leerzeile davor und danach). Keine Szenenüberschriften in der Prosa.`;
}

/** Rewrite brief for the post-draft quality gate. */
export function formatSceneBreakRewriteBrief(
  scenes: RomanSzenenplotScene[],
): string {
  const n = expectedSceneBreakCount(scenes.length);
  const list = scenes
    .map((s, i) => `${i + 1}. ${s.scene_id} — ${s.heading.trim() || s.summary.trim() || "—"}`)
    .join("\n");
  return `ARBEITSAUFTRAG — Szenentrenner:
Füge genau ${n} eigene Absätze \`${SCENE_BREAK_MARKER}\` an den Szenenwechseln ein (Leerzeile davor/danach).
Keine neue Handlung, keine Kürzung, keine Szenenüberschriften. Nur Trenner setzen.
Geplante Szenen (in dieser Reihenfolge):
${list}`;
}

function sceneListBlock(scenes: RomanSzenenplotScene[]): string {
  return scenes
    .map((s, i) => {
      const bits = [
        s.heading.trim() && `Titel: ${s.heading.trim()}`,
        s.summary.trim() && `Inhalt: ${s.summary.trim().slice(0, 220)}`,
        s.dramaturgy.scene_goal.trim() &&
          `Ziel: ${s.dramaturgy.scene_goal.trim().slice(0, 160)}`,
      ].filter(Boolean);
      return `${i + 1}. ${s.scene_id}${bits.length ? ` — ${bits.join(" · ")}` : ""}`;
    })
    .join("\n");
}

function wordDriftOk(before: string, after: string): boolean {
  const a = countWords(before);
  const b = countWords(after.replaceAll(SCENE_BREAK_MARKER, ""));
  if (a < 40 || b < 40) return false;
  return Math.abs(a - b) / a <= WORD_DRIFT_RATIO;
}

async function insertBreaksWithModel(
  chapter: PlotChapter,
  scenes: RomanSzenenplotScene[],
  model: Awaited<ReturnType<typeof resolveRomanAssistModel>>,
): Promise<string | null> {
  const needed = expectedSceneBreakCount(scenes.length);
  const body = normalizeSceneBreakMarkers(chapter.body.trim());
  if (needed < 1) return body;
  if (countSceneBreaks(body) >= needed) return body;

  const raw = (
    await generateText({
      model,
      systemInstruction: `Du setzt Szenentrenner in vorhandene Romanprosa. Du schreibst NICHTS um.
Regeln:
- Gib den VOLLSTÄNDIGEN Kapitel-Body zurück (ohne Kapitelüberschrift).
- Setze genau ${needed} eigene Absätze mit nur \`${SCENE_BREAK_MARKER}\` an den Übergängen zwischen den geplanten Szenen (Reihenfolge unten).
- Leerzeile vor und nach jedem Trenner.
- Keine Szenenüberschriften, keine Meta-Sätze, keine Kürzung, keine neue Handlung.
- Wortlaut der Prosa bleibt gleich — nur Trenner einfügen.`,
      userText: `# Geplante Szenen (in dieser Reihenfolge)
${sceneListBlock(scenes)}

# Kapitel ${chapter.number} — ${chapter.title.trim() || "—"}

${body.slice(0, MAX_CHAPTER_CHARS)}`,
      maxTokens: 16_000,
      timeoutMs: 120_000,
      reasoningEffort: "low",
    })
  ).trim();
  if (!raw || raw.length < 80) return null;
  const next = normalizeSceneBreakMarkers(raw);
  if (countSceneBreaks(next) < needed) return null;
  if (!wordDriftOk(body, next)) return null;
  return next;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export type SceneBreaksPassResult = {
  roman: RomanKontext;
  patchedChapters: number[];
  skippedChapters: number[];
  summary: string;
};

/**
 * Insert missing `* * *` markers from the structured Szenenplot.
 * Chapters that already have enough breaks are only normalized.
 */
export async function runManuskriptSceneBreaksPass(input: {
  roman: RomanKontext;
  onProgress?: (label: string) => void | Promise<void>;
}): Promise<SceneBreaksPassResult> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const text = (editorial.manuskriptText ?? "").trim();
  if (!text || editorial.buchTyp === "clever_erzaehlt") {
    return {
      roman: input.roman,
      patchedChapters: [],
      skippedChapters: [],
      summary: "Szenentrenner übersprungen.",
    };
  }

  const structured = editorial.szenenplotStructured;
  const chapters = parsePlotChapters(text);
  const needWork = chapters.filter((ch) => {
    const planned = structured?.chapters.find((c) => c.number === ch.number);
    const n = planned?.scenes.length ?? 0;
    return chapterMissingSceneBreaks(ch.body, n);
  });

  let nextText = serializeManuskriptChapters(
    chapters.map((ch) => ({
      ...ch,
      body: normalizeSceneBreakMarkers(ch.body),
    })),
  );
  const patched: number[] = [];
  const skipped: number[] = [];

  if (needWork.length === 0) {
    const changed = nextText !== text;
    return {
      roman: changed
        ? {
            ...input.roman,
            editorial: { ...editorial, manuskriptText: nextText },
          }
        : input.roman,
      patchedChapters: [],
      skippedChapters: [],
      summary: changed
        ? "Szenentrenner: vorhandene Marker vereinheitlicht."
        : "Szenentrenner: alle Kapitel haben die geplanten Trenner.",
    };
  }

  await input.onProgress?.(
    `Szenentrenner · ${needWork.length} Kapitel ohne sichtbare Szenenwechsel …`,
  );
  const model = await resolveRomanAssistModel();
  const results = await mapWithConcurrency(needWork, INSERT_CONCURRENCY, async (ch) => {
    const planned = structured?.chapters.find((c) => c.number === ch.number);
    const scenes = planned?.scenes ?? [];
    try {
      const body = await insertBreaksWithModel(ch, scenes, model);
      return { number: ch.number, body };
    } catch {
      return { number: ch.number, body: null };
    }
  });

  for (const row of results) {
    if (!row.body) {
      skipped.push(row.number);
      continue;
    }
    nextText = replaceManuskriptChapterBody(
      nextText,
      input.roman.manuskriptRaw ?? "",
      row.number,
      row.body,
    );
    patched.push(row.number);
  }

  const nextRoman: RomanKontext = {
    ...input.roman,
    editorial: { ...editorial, manuskriptText: nextText },
  };
  const summary =
    skipped.length > 0
      ? `Szenentrenner: Kap. ${patched.join(", ") || "—"} gesetzt; Kap. ${skipped.join(", ")} übersprungen.`
      : `Szenentrenner: Kap. ${patched.join(", ")} gesetzt.`;
  return {
    roman: nextRoman,
    patchedChapters: patched.sort((a, b) => a - b),
    skippedChapters: skipped.sort((a, b) => a - b),
    summary,
  };
}
