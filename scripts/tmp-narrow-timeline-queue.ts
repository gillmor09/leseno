/**
 * Force timeline-pass queue to the six focus chapters only (abort wide queue).
 */
import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  buildTimelinePassQueue,
  entityStatesWithTimelinePass,
} from "@/lib/novel/timeline-pass";
import { getNovelBundle, updateNovel, upsertKnowledgeGraph } from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main() {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nf");
  const queue = buildTimelinePassQueue(b);
  await upsertKnowledgeGraph({
    novelId: NOVEL_ID,
    entityStates: entityStatesWithTimelinePass(
      b.knowledgeGraph?.entityStates ?? {},
      {
        queue,
        done: [],
        status: "running",
        updatedAt: new Date().toISOString(),
      },
    ),
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
      label: `Timeline-Pass fokussiert: Kap. ${queue.join(", ")}`,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });
  console.log("queue", queue);
  const ok = await kickNovelJobHttp({
    hop: { novelId: NOVEL_ID, step: "timeline_pass", chapterNumber: queue[0] },
    delayMs: 800,
  });
  console.log("kick", ok ? "ok" : "FAIL");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
