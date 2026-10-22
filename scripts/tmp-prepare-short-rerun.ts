/**
 * Persist short re-run plan (default 14 chapters) on a paused novel.
 * Does not start generation.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-prepare-short-rerun.ts [novelId] [target]
 */

import {
  SHORT_RERUN_CHAPTER_COUNT,
  entityStatesWithShortRerun,
  getShortRerunPlan,
} from "@/lib/novel/outline-revision";
import {
  getNovelBundle,
  updateNovel,
  upsertKnowledgeGraph,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";
const TARGET = Number(process.argv[3] ?? SHORT_RERUN_CHAPTER_COUNT);

async function main() {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nicht gefunden");
  if (!b.novel.abnahme) throw new Error("Keine Abnahme");
  if (!Number.isFinite(TARGET) || TARGET < 8 || TARGET > 20) {
    throw new Error(`Ungültiges Ziel: ${TARGET}`);
  }
  if (TARGET >= b.chapters.length) {
    throw new Error(
      `Ziel ${TARGET} muss < ${b.chapters.length} Kapitel sein`,
    );
  }

  await upsertKnowledgeGraph({
    novelId: NOVEL_ID,
    entityStates: entityStatesWithShortRerun(
      b.knowledgeGraph?.entityStates ?? {},
      {
        targetChapterCount: TARGET,
        reason:
          "Langer Lauf pausiert — verdichteter Re-Run mit Abnahme-Constraints.",
        preparedAt: new Date().toISOString(),
        status: "planned",
      },
    ),
    timelineEvents: b.knowledgeGraph?.timelineEvents ?? [],
  });

  await updateNovel({
    id: NOVEL_ID,
    status: "paused",
    orchestratorStatus: {
      phase: "error",
      step: "outline_revision",
      chapterNumber: null,
      iteration: null,
      label: `Pausiert — kurzer Re-Run geplant (${TARGET} Kapitel). Bereit zum Start.`,
      error: "manual_pause_for_queue_reset",
      updatedAt: new Date().toISOString(),
    },
  });

  const next = await getNovelBundle(NOVEL_ID);
  const plan = next ? getShortRerunPlan(next) : null;
  console.log(
    JSON.stringify(
      {
        id: NOVEL_ID,
        title: b.novel.title,
        chapters: b.chapters.length,
        status: next?.novel.status,
        label: next?.novel.orchestratorStatus.label,
        plan,
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
