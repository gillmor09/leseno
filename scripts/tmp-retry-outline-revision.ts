import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import { updateNovel } from "@/lib/novel/repository";

const novelId =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main() {
  await updateNovel({
    id: novelId,
    status: "outlining",
    orchestratorStatus: {
      phase: "outline_revision",
      step: "outline_revision",
      chapterNumber: null,
      iteration: null,
      label: "Outline-Revision (Retry)…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });
  const ok = await kickNovelJobHttp({
    hop: { novelId, step: "outline_revision" },
    delayMs: 400,
  });
  console.log(ok ? "kicked" : "FAIL");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
