/**
 * Kill racing hops (sticky error), wait, then start focused timeline queue.
 */
import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  buildTimelinePassQueue,
  entityStatesWithTimelinePass,
} from "@/lib/novel/timeline-pass";
import { entityStatesWithFormulaPass } from "@/lib/novel/formula-pass";
import {
  getNovelBundle,
  updateNovel,
  upsertKnowledgeGraph,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";
const WAIT_MS = Number(process.argv[3] || 45_000);

async function main() {
  await updateNovel({
    id: NOVEL_ID,
    status: "paused",
    orchestratorStatus: {
      phase: "error",
      step: "timeline_pass",
      chapterNumber: null,
      iteration: null,
      label: "Pausiert — warte auf auslaufende Hops…",
      error: "manual_pause_for_queue_reset",
      updatedAt: new Date().toISOString(),
    },
  });
  console.log(`paused, waiting ${WAIT_MS}ms for racing hops…`);
  await new Promise((r) => setTimeout(r, WAIT_MS));

  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nf");
  const queue = buildTimelinePassQueue(b);

  let entityStates = entityStatesWithTimelinePass(
    b.knowledgeGraph?.entityStates ?? {},
    {
      queue,
      done: [],
      status: "running",
      updatedAt: new Date().toISOString(),
    },
  );
  entityStates = entityStatesWithFormulaPass(entityStates, {
    queue: [],
    done: [],
    status: "idle",
    updatedAt: new Date().toISOString(),
  });
  await upsertKnowledgeGraph({
    novelId: NOVEL_ID,
    entityStates,
    timelineEvents: b.knowledgeGraph?.timelineEvents ?? [],
  });

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "timeline_pass",
      step: "timeline_pass",
      chapterNumber: queue[0] ?? null,
      iteration: null,
      label: `Timeline-Pass (fokussiert): ${queue.join(", ")}`,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  console.log("queue", queue);
  const ok = await kickNovelJobHttp({
    hop: {
      novelId: NOVEL_ID,
      step: "timeline_pass",
      chapterNumber: queue[0],
    },
    delayMs: 500,
  });
  console.log("kick", ok ? "ok" : "FAIL");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
