/**
 * Stop races, re-soft-approve healed chapters, park at first empty chapter.
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  // Hard stop signal for in-flight hops that check status mid-way (best-effort).
  await updateNovel({
    id: NOVEL_ID,
    status: "error",
    orchestratorStatus: {
      phase: "error",
      step: "review",
      chapterNumber: 13,
      iteration: null,
      label: "Pipeline gestoppt für Lückenheilung…",
      error: "paused_for_heal",
      updatedAt: new Date().toISOString(),
    },
  });
  await sleep(4_000);

  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("not found");

  const targets = b.chapters
    .filter((c) => {
      const draft = (c.rawDraft || "").trim().length >= 80;
      const ok =
        c.status === "approved" || c.status === "approved_with_warnings";
      return draft && !ok;
    })
    .sort((a, c) => a.chapterNumber - c.chapterNumber);

  console.log(
    "re-approve:",
    targets.map((c) => c.chapterNumber),
  );

  for (const ch of targets) {
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
        `Lückenheilung (Lock): Kap. ${ch.chapterNumber} freigegeben trotz Cursor-Rennen.`,
      ],
      approved: true,
    });
  }

  await sleep(2_000);

  // Re-read and force statuses once more in case a late hop wrote planned/drafting.
  const again = await getNovelBundle(NOVEL_ID);
  if (!again) throw new Error("reload failed");
  for (const ch of again.chapters) {
    const draft = (ch.rawDraft || "").trim().length >= 80;
    const ok =
      ch.status === "approved" || ch.status === "approved_with_warnings";
    if (draft && !ok) {
      await upsertChapter({ ...ch, status: "approved_with_warnings" });
      console.log("second pass approve", ch.chapterNumber);
    }
  }

  const final = await getNovelBundle(NOVEL_ID);
  if (!final) throw new Error("final missing");
  const firstEmpty = final.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber)
    .find((c) => (c.rawDraft || "").trim().length < 80);

  const hop = firstEmpty
    ? {
        novelId: NOVEL_ID,
        step: "scene_plan" as const,
        chapterNumber: firstEmpty.chapterNumber,
      }
    : { novelId: NOVEL_ID, step: "manuscript_review" as const };

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: firstEmpty ? "scene_plan" : "manuscript_review",
      step: hop.step,
      chapterNumber: firstEmpty?.chapterNumber ?? null,
      iteration: null,
      label: firstEmpty
        ? `Geheilt — weiter Kap. ${firstEmpty.chapterNumber}…`
        : "Geheilt — Buch-Review…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const kicked = await kickNovelJobHttp({ hop, delayMs: 1500 });
  const summary = final.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber)
    .slice(0, 14)
    .map((c) => `${c.chapterNumber}:${c.status}:${(c.rawDraft || "").trim().length}`);
  console.log(summary.join("\n"));
  console.log({ kicked, hop });
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
