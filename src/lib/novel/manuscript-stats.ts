/**
 * Manuscript progress helpers for the greenfield Roman cockpit.
 * Word counts are whitespace tokens (same idea as Clever `countWords`).
 */

import type { NovelBundle, NovelChapter } from "@/lib/novel/types";

/** Fallback when outline/scenes are not seeded yet. */
export const NOVEL_DEFAULT_TARGET_WORDS = 50_000;

/** Midpoint scene length used to project book target from the plan. */
export const WORDS_PER_PLANNED_SCENE = 800;

/** Soft floor: drafts below this are considered thin vs. the Richtwert. */
export const WORDS_PER_SCENE_MIN = 650;

/** Fallback per chapter when scene plan is empty. */
const WORDS_PER_CHAPTER_FALLBACK = 4_000;

/** Approximate German word count (whitespace tokens). */
export function countNovelWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function formatNovelWordCount(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

/**
 * Current manuscript length: assembled chapter prose, plus in-flight
 * (not yet approved) scene drafts so the counter moves during writing.
 */
export function countNovelManuscriptWords(bundle: NovelBundle): number {
  let total = 0;
  for (const chapter of bundle.chapters) {
    const assembled = (chapter.finalText || chapter.rawDraft).trim();
    if (assembled) {
      total += countNovelWords(assembled);
      for (const scene of bundle.scenes) {
        if (scene.chapterId !== chapter.id) continue;
        if (scene.status === "approved") continue;
        total += countNovelWords(scene.finalText || scene.rawText);
      }
      continue;
    }
    for (const scene of bundle.scenes) {
      if (scene.chapterId !== chapter.id) continue;
      total += countNovelWords(scene.finalText || scene.rawText);
    }
  }
  return total;
}

export function countChapterWords(
  chapter: NovelChapter,
  bundle: NovelBundle,
): number {
  const assembled = (chapter.finalText || chapter.rawDraft).trim();
  if (assembled) return countNovelWords(assembled);
  return bundle.scenes
    .filter((s) => s.chapterId === chapter.id)
    .reduce(
      (n, s) => n + countNovelWords(s.finalText || s.rawText),
      0,
    );
}

/**
 * Soft Ziellänge from the outline/scene plan (Richtwert, no DB field yet).
 * Prefer planned scene count × ~800 Wörter; else chapters × ~4.000.
 */
export function estimateNovelTargetWords(bundle: NovelBundle): number {
  const plannedFromScenes = bundle.scenes.length;
  const plannedFromOutline = bundle.chapters.reduce(
    (n, c) => n + Math.max(c.scenePlan.length, 0),
    0,
  );
  const sceneSlots = Math.max(plannedFromScenes, plannedFromOutline);
  if (sceneSlots > 0) {
    return Math.round(sceneSlots * WORDS_PER_PLANNED_SCENE);
  }
  if (bundle.chapters.length > 0) {
    return Math.round(bundle.chapters.length * WORDS_PER_CHAPTER_FALLBACK);
  }
  return NOVEL_DEFAULT_TARGET_WORDS;
}
