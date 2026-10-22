/**
 * Optional Export Formel-Tic scrub (chapter-level).
 * Primary gate is per-scene `scene_tic_scrub` in tree-pipeline; this is a leftover pass.
 */

import { countNovelWords } from "@/lib/novel/manuscript-stats";
import {
  detectCrossChapterFormulaHits,
  detectNovelProseTics,
  type NovelProseTicHit,
} from "@/lib/novel/prose-tic-detect";
import { generateAsStylist } from "@/lib/novel/roles";
import {
  getNovelBundle,
  updateNovel,
  upsertChapter,
} from "@/lib/novel/repository";
import type {
  NovelBundle,
  NovelJobHop,
  OrchestratorStatus,
} from "@/lib/novel/types";

export type FormelTicScrubOutcome =
  | { outcome: "ok" }
  | { outcome: "continue"; hop: NovelJobHop }
  | { outcome: "error"; message: string };

type StatusFn = (
  novelId: string,
  patch: OrchestratorStatus,
  novelStatus?: string,
) => Promise<void>;

/** Scan all chapters for Formel-Tic hits (re-export for Export UI). */
export function scanKapitelFormelTics(bundle: NovelBundle): Array<{
  chapterNumber: number;
  title: string;
  hits: NovelProseTicHit[];
}> {
  const chapters = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const out: Array<{
    chapterNumber: number;
    title: string;
    hits: NovelProseTicHit[];
  }> = [];
  const prior: string[] = [];
  for (const c of chapters) {
    const body = (c.finalText || c.rawDraft).trim();
    if (body.length < 80) {
      prior.push(body);
      continue;
    }
    const hits = [
      ...detectNovelProseTics(body),
      ...detectCrossChapterFormulaHits({
        currentText: body,
        priorChapterTexts: prior,
      }),
    ];
    if (hits.length > 0) {
      out.push({
        chapterNumber: c.chapterNumber,
        title: c.title || `Kapitel ${c.chapterNumber}`,
        hits,
      });
    }
    prior.push(body);
  }
  return out;
}

export function formatTicChangeOrders(hits: NovelProseTicHit[]): string {
  return hits
    .slice(0, 8)
    .map((h) => `- ${h.label}: ${h.detail}`)
    .join("\n");
}

/** Queue chapters with hits; kick first hop. */
export async function beginFormelTicScrub(novelId: string): Promise<{
  hop: NovelJobHop;
  hitChapters: number;
  hitTotal: number;
}> {
  const bundle = await getNovelBundle(novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scan = scanKapitelFormelTics(bundle);
  if (scan.length === 0) {
    throw new Error("Keine Formel-Tics gefunden.");
  }
  const queue = scan.map((s) => s.chapterNumber);
  const hitTotal = scan.reduce((n, s) => n + s.hits.length, 0);
  await updateNovel({
    id: novelId,
    status: "writing",
    orchestratorStatus: {
      phase: "formel_tic_scrub",
      label: `Formel-Tic-Bereinigung: ${scan.length} Kapitel…`,
      step: "formel_tic_scrub",
      chapterNumber: queue[0],
      haltReason: null,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });
  // Stash queue in state_matrix under a reserved key (no extra table).
  await updateNovel({
    id: novelId,
    stateMatrix: {
      ...(bundle.novel.stateMatrix ?? {}),
      __formelTicQueue: queue,
    },
  });
  return {
    hop: {
      novelId,
      step: "formel_tic_scrub",
      chapterNumber: queue[0],
    },
    hitChapters: scan.length,
    hitTotal,
  };
}

export async function runFormelTicScrubHop(input: {
  novelId: string;
  chapterNumber?: number;
  status: StatusFn;
}): Promise<FormelTicScrubOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const matrix = bundle.novel.stateMatrix ?? {};
  const queueRaw = matrix.__formelTicQueue;
  const queue = Array.isArray(queueRaw)
    ? queueRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1)
    : [];
  const chapterNumber = input.chapterNumber ?? queue[0];
  if (!chapterNumber) {
    await input.status(
      input.novelId,
      {
        phase: "completed",
        label: "Formel-Tic-Bereinigung fertig.",
        step: "completed",
      },
      "completed",
    );
    const { __formelTicQueue: _, ...rest } = matrix as Record<
      string,
      unknown
    > & { __formelTicQueue?: unknown };
    await updateNovel({ id: input.novelId, stateMatrix: rest });
    return { outcome: "ok" };
  }

  const chapter = bundle.chapters.find((c) => c.chapterNumber === chapterNumber);
  if (!chapter) {
    return continueQueue(input.novelId, queue, chapterNumber, input.status);
  }

  const body = (chapter.finalText || chapter.rawDraft).trim();
  const prior = bundle.chapters
    .filter((c) => c.chapterNumber < chapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => (c.finalText || c.rawDraft).trim());
  const hits = [
    ...detectNovelProseTics(body),
    ...detectCrossChapterFormulaHits({
      currentText: body,
      priorChapterTexts: prior,
    }),
  ];

  await input.status(input.novelId, {
    phase: "formel_tic_scrub",
    label: `Formel-Tic Kap. ${chapterNumber} (${hits.length} Treffer)…`,
    step: "formel_tic_scrub",
    chapterNumber,
  });

  if (hits.length > 0 && body.length >= 80) {
    const words = countNovelWords(body);
    const fixed = await generateAsStylist({
      userText: `Bereinige Formel-Tics im Kapitel. Handlung unverändert.
Mindestens ${words} Wörter — nicht kürzen.

## Tic-Aufträge
${formatTicChangeOrders(hits)}

Kapiteltext:
${body.slice(0, 16_000)}`,
    });
    const kept =
      countNovelWords(fixed) >= words * 0.9 ? fixed.trim() : body;
    await upsertChapter({
      ...chapter,
      finalText: kept,
      rawDraft: kept,
    });
  }

  return continueQueue(input.novelId, queue, chapterNumber, input.status);
}

async function continueQueue(
  novelId: string,
  queue: number[],
  doneChapter: number,
  status: StatusFn,
): Promise<FormelTicScrubOutcome> {
  const next = queue.filter((n) => n !== doneChapter);
  const bundle = await getNovelBundle(novelId);
  const matrix = { ...(bundle?.novel.stateMatrix ?? {}) };
  if (next.length === 0) {
    delete matrix.__formelTicQueue;
    await updateNovel({ id: novelId, stateMatrix: matrix });
    await status(
      novelId,
      {
        phase: "completed",
        label: "Formel-Tic-Bereinigung fertig.",
        step: "completed",
      },
      "completed",
    );
    return { outcome: "ok" };
  }
  matrix.__formelTicQueue = next;
  await updateNovel({ id: novelId, stateMatrix: matrix });
  return {
    outcome: "continue",
    hop: {
      novelId,
      step: "formel_tic_scrub",
      chapterNumber: next[0],
    },
  };
}
