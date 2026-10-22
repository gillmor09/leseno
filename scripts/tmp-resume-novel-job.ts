/**
 * One-shot: resume greenfield novel orchestrator (simulates „Fortsetzen“).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-resume-novel-job.ts [novelId]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import { resumeNovelHop } from "@/lib/novel/novelOrchestrator";
import { getNovelBundle, updateNovel } from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "7d66e3a4-6155-4576-a19d-f51df437decf";

async function main(): Promise<void> {
  const bundle = await getNovelBundle(NOVEL_ID);
  if (!bundle) {
    throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);
  }

  const orch = bundle.novel.orchestratorStatus;
  console.log("before:", {
    status: bundle.novel.status,
    phase: orch.phase,
    step: orch.step,
    chapterNumber: orch.chapterNumber,
    iteration: orch.iteration,
    label: orch.label,
    error: orch.error,
    chapters: bundle.chapters.length,
  });

  const hop = resumeNovelHop({
    novelId: NOVEL_ID,
    phase: orch.phase,
    step: orch.step,
    chapterNumber: orch.chapterNumber,
    iteration: orch.iteration,
  });

  const resumeStatus =
    hop.step === "outline"
      ? "outlining"
      : hop.step === "style_guide" || hop.step === "world_building"
        ? "setup"
        : "writing";

  await updateNovel({
    id: NOVEL_ID,
    status: resumeStatus,
    orchestratorStatus: {
      ...orch,
      phase:
        hop.step === "style_guide" ||
        hop.step === "world_building" ||
        hop.step === "outline" ||
        hop.step === "scene_plan" ||
        hop.step === "draft" ||
        hop.step === "review" ||
        hop.step === "state_sync"
          ? hop.step
          : orch.phase === "error"
            ? "draft"
            : orch.phase,
      step: hop.step,
      chapterNumber: hop.chapterNumber ?? orch.chapterNumber,
      iteration: hop.iteration ?? orch.iteration,
      label: `Setze fort (${hop.step})…`,
      error: null,
    },
  });

  console.log("hop:", hop);
  const kicked = await kickNovelJobHttp({ hop, delayMs: 0 });
  console.log(kicked ? "kicked: ok" : "kicked: FAILED");
  if (!kicked) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
