/**
 * List novels with orchestrator status.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-list-novels.ts
 */

import { listNovels } from "@/lib/novel/repository";

async function main() {
  const list = await listNovels();
  console.log(`count=${list.length}`);
  for (const n of list) {
    console.log(
      JSON.stringify({
        id: n.id,
        title: n.title,
        status: n.status,
        phase: n.orchestratorStatus?.phase,
        step: n.orchestratorStatus?.step,
        label: (n.orchestratorStatus?.label ?? "").slice(0, 100),
        updatedAt: n.orchestratorStatus?.updatedAt,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
