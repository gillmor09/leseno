/**
 * Soft-approve stuck chapter 4 and continue at state_sync.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-unblock-ch4.ts [novelId]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  getNovelBundle,
  insertEditorFeedback,
  updateNovel,
  upsertChapter,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main(): Promise<void> {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);
  const ch4 = b.chapters.find((c) => c.chapterNumber === 4);
  if (!ch4) throw new Error("Kapitel 4 fehlt.");
  const draft = (ch4.rawDraft || "").trim();
  if (draft.length < 80) throw new Error("Kapitel 4 hat keinen brauchbaren Draft.");

  console.log("before:", {
    status: b.novel.status,
    phase: b.novel.orchestratorStatus.phase,
    step: b.novel.orchestratorStatus.step,
    ch4: ch4.status,
    rawLen: draft.length,
  });

  await upsertChapter({
    ...ch4,
    status: "approved_with_warnings",
  });
  await insertEditorFeedback({
    chapterId: ch4.id,
    iteration: 3,
    score: 55,
    toneAlignmentScore: 55,
    issues: [
      "Manuell freigegeben nach Endlos-Reparatur (repairCycle-Bug). Mit Warnung weiter; Buch-Strukturrevision kann nachziehen.",
    ],
    approved: true,
  });

  const hop = {
    novelId: NOVEL_ID,
    step: "state_sync" as const,
    chapterNumber: 4,
  };

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "state_sync",
      step: "state_sync",
      chapterNumber: 4,
      iteration: null,
      label: "Kap. 4 freigegeben (Warnung) — Wissensgraph, dann weiter…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const kicked = await kickNovelJobHttp({ hop, delayMs: 0 });
  console.log("after kick:", { kicked, hop });
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
