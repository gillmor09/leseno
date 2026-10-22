/**
 * Soft-approve chapter 6 and run state_sync only (do not chain to next chapter).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-soft-approve-ch6-sync.ts [novelId]
 */

import { runNovelOrchestratorHop } from "@/lib/novel/novelOrchestrator";
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
  const ch6 = b.chapters.find((c) => c.chapterNumber === 6);
  if (!ch6) throw new Error("Kapitel 6 fehlt.");
  const draft = (ch6.rawDraft || "").trim();
  if (draft.length < 80) throw new Error("Kapitel 6 ohne Draft.");

  // Remember where the live pipeline is so we don't steal its cursor permanently.
  const resume = {
    phase: b.novel.orchestratorStatus.phase,
    step: b.novel.orchestratorStatus.step ?? "draft",
    chapterNumber: b.novel.orchestratorStatus.chapterNumber ?? null,
    iteration: b.novel.orchestratorStatus.iteration ?? null,
    label: b.novel.orchestratorStatus.label,
  };

  console.log("live cursor:", resume);
  console.log("ch6 before:", { status: ch6.status, rawLen: draft.length });

  await upsertChapter({
    ...ch6,
    status: "approved_with_warnings",
  });
  await insertEditorFeedback({
    chapterId: ch6.id,
    iteration: 3,
    score: 55,
    toneAlignmentScore: 55,
    issues: [
      "Nachzug: Kap. 6 manuell freigegeben (Pipeline war vorausgelaufen). Mit Warnung; state_sync nachziehen.",
    ],
    approved: true,
  });

  // Run state_sync in-process so we don't self-kick into chapter 7 again.
  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "state_sync",
      step: "state_sync",
      chapterNumber: 6,
      iteration: null,
      label: "Nachzug Kap. 6 — Wissensgraph…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const result = await runNovelOrchestratorHop({
    novelId: NOVEL_ID,
    step: "state_sync",
    chapterNumber: 6,
  });
  console.log("state_sync outcome:", result.outcome);

  // Restore live cursor so the racing chapter job can keep going / Fortsetzen works.
  const after = await getNovelBundle(NOVEL_ID);
  const ch6After = after?.chapters.find((c) => c.chapterNumber === 6);
  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: resume.phase === "error" ? "draft" : resume.phase,
      step: resume.step,
      chapterNumber: resume.chapterNumber,
      iteration: resume.iteration,
      label: resume.label || `Weiter bei ${resume.step}…`,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  console.log("ch6 after:", {
    status: ch6After?.status,
    rawLen: (ch6After?.rawDraft || "").length,
  });
  console.log("cursor restored:", resume);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
