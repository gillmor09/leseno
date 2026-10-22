/**
 * Soft-approve incomplete chapters that already have drafts, sync KG in-process,
 * then park the cursor at the first empty planned chapter.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-heal-novel-gaps.ts [novelId]
 */

import { runNovelOrchestratorHop } from "@/lib/novel/novelOrchestrator";
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

  // Freeze live cursor so racing hops don't leap ahead mid-heal.
  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "review",
      step: "review",
      chapterNumber: b.novel.orchestratorStatus.chapterNumber ?? 1,
      iteration: 1,
      label: "Lückenheilung — Pipeline pausiert…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const chapters = b.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber);

  const needsHeal = chapters.filter((c) => {
    const ok =
      c.status === "approved" || c.status === "approved_with_warnings";
    const draft = (c.rawDraft || "").trim();
    return !ok && draft.length >= 80;
  });

  console.log(
    "heal targets:",
    needsHeal.map((c) => c.chapterNumber),
  );

  for (const ch of needsHeal) {
    console.log(`soft-approve + sync Kap. ${ch.chapterNumber}…`);
    await upsertChapter({
      ...ch,
      status: "approved_with_warnings",
    });
    await insertEditorFeedback({
      chapterId: ch.id,
      iteration: 3,
      score: 50,
      toneAlignmentScore: 50,
      issues: [
        `Lückenheilung: Kap. ${ch.chapterNumber} manuell freigegeben nach Cursor-Wildwuchs. Mit Warnung; state_sync nachgezogen.`,
      ],
      approved: true,
    });

    await updateNovel({
      id: NOVEL_ID,
      status: "writing",
      orchestratorStatus: {
        phase: "state_sync",
        step: "state_sync",
        chapterNumber: ch.chapterNumber,
        iteration: null,
        label: `Lückenheilung Kap. ${ch.chapterNumber} — Wissensgraph…`,
        error: null,
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await runNovelOrchestratorHop({
      novelId: NOVEL_ID,
      step: "state_sync",
      chapterNumber: ch.chapterNumber,
    });
    console.log(`  Kap. ${ch.chapterNumber} sync:`, result.outcome);
  }

  const after = await getNovelBundle(NOVEL_ID);
  if (!after) throw new Error("Bundle nach Heal fehlt.");
  const firstEmpty = after.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber)
    .find((c) => (c.rawDraft || "").trim().length < 80);

  if (!firstEmpty) {
    await updateNovel({
      id: NOVEL_ID,
      status: "writing",
      orchestratorStatus: {
        phase: "manuscript_review",
        step: "manuscript_review",
        chapterNumber: null,
        iteration: null,
        label: "Alle Kapitel haben Drafts — Buch-Review…",
        error: null,
        updatedAt: new Date().toISOString(),
      },
    });
    const kicked = await kickNovelJobHttp({
      hop: { novelId: NOVEL_ID, step: "manuscript_review" },
      delayMs: 0,
    });
    console.log("all drafted → manuscript_review kicked:", kicked);
    return;
  }

  const hop = {
    novelId: NOVEL_ID,
    step: "scene_plan" as const,
    chapterNumber: firstEmpty.chapterNumber,
  };
  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "scene_plan",
      step: "scene_plan",
      chapterNumber: firstEmpty.chapterNumber,
      iteration: null,
      label: `Weiter vorne: Kap. ${firstEmpty.chapterNumber} Szenenplan…`,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });
  const kicked = await kickNovelJobHttp({ hop, delayMs: 0 });
  console.log("forward kick:", { kicked, hop });
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
