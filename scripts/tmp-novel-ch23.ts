/**
 * Unblock novel stuck on chapter review (esp. Kap. 23).
 * Soft-approves drafting chapters that already have drafts, seeds wave.syncDone
 * for all approved chapters, then resumes at wave_dispatch.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/tmp-novel-ch23.ts [novelId]
 *   npx tsx --env-file=.env.local scripts/tmp-novel-ch23.ts [novelId] --approve --resume
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  entityStatesWithWave,
  emptyWaveState,
  getWaveState,
  resolveWaveSize,
} from "@/lib/novel/wave-batch";
import {
  getNovelBundle,
  insertEditorFeedback,
  listNovels,
  updateNovel,
  upsertChapter,
  upsertKnowledgeGraph,
} from "@/lib/novel/repository";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const novelArg = args.find((a) => !a.startsWith("--"));

async function resolveNovelId(): Promise<string> {
  if (novelArg) return novelArg;
  const list = await listNovels();
  if (!list.length) throw new Error("Keine Romane gefunden.");
  const sorted = list
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  console.log(
    "recent novels:",
    sorted.slice(0, 5).map((n) => ({
      id: n.id,
      title: n.title,
      status: n.status,
      updatedAt: n.updatedAt,
    })),
  );
  return sorted[0]!.id;
}

async function main(): Promise<void> {
  const novelId = await resolveNovelId();
  let b = await getNovelBundle(novelId);
  if (!b) throw new Error(`Novel nicht gefunden: ${novelId}`);

  const o = b.novel.orchestratorStatus;
  const wave = getWaveState(b);
  console.log(
    JSON.stringify(
      {
        novelId,
        title: b.novel.title,
        status: b.novel.status,
        orch: {
          phase: o.phase,
          step: o.step,
          chapterNumber: o.chapterNumber,
          label: o.label,
          error: o.error?.slice(0, 240),
        },
        wave,
        drafting: b.chapters
          .filter((c) => c.status === "drafting" || c.status === "reviewing")
          .map((c) => ({
            n: c.chapterNumber,
            status: c.status,
            draftLen: (c.rawDraft || "").trim().length,
          })),
        plannedEmpty: b.chapters
          .filter(
            (c) =>
              c.status === "planned" && !(c.rawDraft || "").trim(),
          )
          .map((c) => c.chapterNumber),
      },
      null,
      2,
    ),
  );

  if (!flags.has("--approve")) {
    console.log("Diag only. Re-run with --approve --resume to unblock.");
    return;
  }

  // Freeze racing hops.
  await updateNovel({
    id: novelId,
    status: "writing",
    orchestratorStatus: {
      phase: "review",
      step: "review",
      chapterNumber: o.chapterNumber ?? 23,
      iteration: 1,
      label: "Manuelle Entsperrung — Pipeline pausiert…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  b = (await getNovelBundle(novelId))!;
  const stuck = b.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber)
    .filter((c) => {
      const ok =
        c.status === "approved" || c.status === "approved_with_warnings";
      const draft = (c.rawDraft || "").trim();
      return !ok && draft.length >= 80;
    });

  console.log(
    "soft-approve targets:",
    stuck.map((c) => c.chapterNumber),
  );

  for (const ch of stuck) {
    await upsertChapter({
      ...ch,
      status: "approved_with_warnings",
    });
    await insertEditorFeedback({
      chapterId: ch.id,
      // DB check: iteration 1–3 (unique per chapter+iteration not required).
      iteration: 3,
      score: 55,
      toneAlignmentScore: 55,
      issues: [
        `Manuelle Freigabe: Kap. ${ch.chapterNumber} blockierte die Pipeline (wiederholte Review-Abbrüche / Lücke). Mit Warnung freigegeben — später ggf. nachziehen.`,
      ],
      approved: true,
    });
    console.log(`approved Kap. ${ch.chapterNumber}`);
  }

  b = (await getNovelBundle(novelId))!;
  const syncDone = b.chapters
    .filter(
      (c) =>
        c.status === "approved" || c.status === "approved_with_warnings",
    )
    .map((c) => c.chapterNumber)
    .sort((a, c) => a - c);

  const seeded = {
    ...emptyWaveState(resolveWaveSize()),
    waveIndex: Math.floor(syncDone.length / resolveWaveSize()),
    syncDone,
    reviewDone: [],
    activeChapters: [],
    status: "idle" as const,
  };

  await upsertKnowledgeGraph({
    novelId,
    entityStates: entityStatesWithWave(
      b.knowledgeGraph?.entityStates ?? {},
      seeded,
    ),
    timelineEvents: b.knowledgeGraph?.timelineEvents ?? [],
  });
  console.log("seeded wave.syncDone:", syncDone.join(", "));

  await updateNovel({
    id: novelId,
    status: "writing",
    orchestratorStatus: {
      phase: "wave_dispatch",
      step: "wave_dispatch",
      chapterNumber: syncDone[syncDone.length - 1] ?? null,
      iteration: null,
      label: "Entsperrt — nächste Welle…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  if (!flags.has("--resume")) {
    console.log("approved + wave seeded. Re-run with --resume to kick.");
    return;
  }

  const hop = { novelId, step: "wave_dispatch" };
  console.log("kicking", hop);
  const ok = await kickNovelJobHttp({ hop, delayMs: 400 });
  console.log("kick", ok ? "ok" : "FAILED — bitte Fortsetzen im UI");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
