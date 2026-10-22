/**
 * Stop racing hops, wipe chapter drafts, Fast-Draft, restart at wave_dispatch
 * (keeps idea / styleguide / voice / outline).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-stop-and-restart-fast.ts [novelId] [waitMs]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  emptyAssistedFixState,
  entityStatesWithAssistedFix,
} from "@/lib/novel/assisted-fix";
import {
  emptyFormulaPassState,
  entityStatesWithFormulaPass,
} from "@/lib/novel/formula-pass";
import {
  emptyManuscriptRevisionState,
  entityStatesWithManuscriptRevision,
} from "@/lib/novel/manuscript-revision";
import {
  emptyTimelinePassState,
  entityStatesWithTimelinePass,
} from "@/lib/novel/timeline-pass";
import { emptyWaveState, entityStatesWithWave } from "@/lib/novel/wave-batch";
import {
  entityStatesWithWriteMode,
  WRITE_MODE_KEY,
} from "@/lib/novel/write-mode";
import {
  getNovelBundle,
  updateNovel,
  upsertChapter,
  upsertKnowledgeGraph,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "30799e75-bafc-4b33-8fa9-9edf7f28a4a5";
const WAIT_MS = Number(process.argv[3] || 20_000);

async function main() {
  const before = await getNovelBundle(NOVEL_ID);
  if (!before) throw new Error("nicht gefunden");

  console.log("pausing…", {
    status: before.novel.status,
    phase: before.novel.orchestratorStatus.phase,
    step: before.novel.orchestratorStatus.step,
    chapters: before.chapters.length,
  });

  await updateNovel({
    id: NOVEL_ID,
    status: "paused",
    orchestratorStatus: {
      phase: "error",
      step: "wave_barrier",
      chapterNumber: null,
      iteration: null,
      label: "Pausiert — Neustart Fast-Draft…",
      error: "manual_pause_for_queue_reset",
      updatedAt: new Date().toISOString(),
    },
  });

  console.log(`waiting ${WAIT_MS}ms for racing hops…`);
  await new Promise((r) => setTimeout(r, WAIT_MS));

  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nicht gefunden nach Pause");

  // Wipe drafts via RPC (leseno table not exposed to PostgREST schema API).
  let wiped = 0;
  for (const ch of b.chapters) {
    await upsertChapter({
      id: ch.id,
      novelId: NOVEL_ID,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      outline: ch.outline,
      contract: ch.contract,
      scenePlan: [],
      rawDraft: "",
      finalText: "",
      status: "planned",
    });
    wiped += 1;
  }
  console.log("chapters wiped:", wiped);

  let entityStates = { ...(b.knowledgeGraph?.entityStates ?? {}) };
  for (const key of [
    "__waveBatch",
    "__timelinePass",
    "__formulaPass",
    "__manuscriptRevision",
    "__assistedFix",
    "__shortRerun",
    "__ledgerDebt",
  ]) {
    delete entityStates[key];
  }
  entityStates = entityStatesWithWriteMode(entityStates, "fast");
  entityStates = entityStatesWithWave(entityStates, emptyWaveState());
  entityStates = entityStatesWithTimelinePass(
    entityStates,
    emptyTimelinePassState(),
  );
  entityStates = entityStatesWithFormulaPass(
    entityStates,
    emptyFormulaPassState(),
  );
  entityStates = entityStatesWithManuscriptRevision(
    entityStates,
    emptyManuscriptRevisionState(),
  );
  entityStates = entityStatesWithAssistedFix(
    entityStates,
    emptyAssistedFixState(),
  );

  await upsertKnowledgeGraph({
    novelId: NOVEL_ID,
    entityStates,
    timelineEvents: b.knowledgeGraph?.timelineEvents ?? [],
  });

  const hasOutline = b.chapters.length >= 3;
  const hopStep = hasOutline ? "wave_dispatch" : "style_guide";

  await updateNovel({
    id: NOVEL_ID,
    status: hasOutline ? "writing" : "setup",
    orchestratorStatus: {
      phase: hopStep === "wave_dispatch" ? "wave_dispatch" : "style_guide",
      step: hopStep,
      chapterNumber: null,
      iteration: null,
      label: hasOutline
        ? "Neustart Fast-Draft: Wave-Schreiben…"
        : "Neustart Fast-Draft: Styleguide…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const kicked = await kickNovelJobHttp({
    hop: { novelId: NOVEL_ID, step: hopStep },
    delayMs: 500,
  });

  const after = await getNovelBundle(NOVEL_ID);
  console.log(
    JSON.stringify(
      {
        id: NOVEL_ID,
        title: after?.novel.title,
        status: after?.novel.status,
        label: after?.novel.orchestratorStatus.label,
        writeMode: after?.knowledgeGraph?.entityStates?.[WRITE_MODE_KEY],
        chapters: after?.chapters.length ?? 0,
        hop: hopStep,
        kicked: kicked ? "ok" : "FAIL",
      },
      null,
      2,
    ),
  );
  if (!kicked) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
