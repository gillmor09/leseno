/**
 * After raising repair limits: clear ch5 error and continue at draft.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-resume-ch5-more-retries.ts [novelId]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  getNovelBundle,
  insertEditorFeedback,
  updateNovel,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main(): Promise<void> {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);
  const ch5 = b.chapters.find((c) => c.chapterNumber === 5);
  if (!ch5) throw new Error("Kapitel 5 fehlt.");

  // Reset consecutive-fail counter so raised MAX_CHAPTER_REVIEW_FAILS applies fresh.
  await insertEditorFeedback({
    chapterId: ch5.id,
    iteration: 3,
    score: 50,
    toneAlignmentScore: 50,
    issues: [
      "Zähler zurückgesetzt nach Limit-Erhöhung (mehr Reparatur-Durchläufe). Weiter mit Draft.",
    ],
    approved: true,
  });

  const hop = {
    novelId: NOVEL_ID,
    step: "draft" as const,
    chapterNumber: 5,
    iteration: 1,
    repairCycle: 0,
  };

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "draft",
      step: "draft",
      chapterNumber: 5,
      iteration: 1,
      label: "Kap. 5 — Fortsetzen mit erhöhten Reparatur-Limits…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const kicked = await kickNovelJobHttp({ hop, delayMs: 0 });
  console.log({ kicked, hop });
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
