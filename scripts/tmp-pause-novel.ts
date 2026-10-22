/**
 * Cleanly pause novel orchestrator (racing hops exit on paused status).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-pause-novel.ts [novelId]
 */

import { getNovelBundle, updateNovel } from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main() {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nicht gefunden");
  const orch = b.novel.orchestratorStatus;
  await updateNovel({
    id: NOVEL_ID,
    status: "paused",
    orchestratorStatus: {
      phase: "error",
      step: orch.step ?? "wave_barrier",
      chapterNumber: orch.chapterNumber ?? null,
      iteration: orch.iteration ?? null,
      label:
        "Pausiert — kurzer Re-Run geplant (ca. 14 Kapitel). Hops gestoppt.",
      error: "manual_pause_for_queue_reset",
      updatedAt: new Date().toISOString(),
    },
  });
  console.log(
    JSON.stringify(
      {
        id: NOVEL_ID,
        title: b.novel.title,
        was: { status: b.novel.status, phase: orch.phase, step: orch.step },
        now: "paused",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
