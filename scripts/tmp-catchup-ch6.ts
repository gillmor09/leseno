/**
 * Stop racing hops, run chapter 6 review → (on approve) state_sync → ch7.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-catchup-ch6.ts [novelId]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  getNovelBundle,
  updateNovel,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main(): Promise<void> {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);
  const ch6 = b.chapters.find((c) => c.chapterNumber === 6);
  if (!ch6) throw new Error("Kapitel 6 fehlt.");
  const draft = (ch6.rawDraft || "").trim();
  if (draft.length < 80) {
    throw new Error("Kapitel 6 hat keinen Draft — zuerst scene_plan/draft nötig.");
  }

  console.log("before:", {
    status: b.novel.status,
    phase: b.novel.orchestratorStatus.phase,
    step: b.novel.orchestratorStatus.step,
    ch: b.novel.orchestratorStatus.chapterNumber,
    ch6: ch6.status,
    rawLen: draft.length,
  });

  // Park pipeline on ch6 review so any late ch7 kick is superseded by this cursor.
  const hop = {
    novelId: NOVEL_ID,
    step: "review" as const,
    chapterNumber: 6,
    iteration: 1,
    repairCycle: 0,
  };

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "review",
      step: "review",
      chapterNumber: 6,
      iteration: 1,
      label: "Nachzug Kap. 6 — Lektorat…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const kicked = await kickNovelJobHttp({ hop, delayMs: 500 });
  console.log("kicked review ch6:", kicked, hop);
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
