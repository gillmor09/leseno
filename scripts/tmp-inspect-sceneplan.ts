import { getLogicLedger } from "@/lib/novel/logic-ledger";
import { getNovelBundle } from "@/lib/novel/repository";

async function main() {
  const id = process.argv[2] || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";
  const b = await getNovelBundle(id);
  if (!b) throw new Error("nf");

  let withBeats = 0;
  const beatTypes: Record<string, number> = {};
  for (const c of b.chapters) {
    const sp = c.scenePlan;
    const scenes = Array.isArray(sp)
      ? sp
      : sp && typeof sp === "object" && Array.isArray((sp as { scenes?: unknown }).scenes)
        ? (sp as { scenes: unknown[] }).scenes
        : null;
    if (scenes && scenes.length > 0) {
      withBeats += 1;
      for (const s of scenes) {
        if (s && typeof s === "object") {
          const beat = String((s as { beat?: string }).beat ?? "?");
          beatTypes[beat] = (beatTypes[beat] ?? 0) + 1;
        }
      }
    }
  }

  for (const n of [1, 6, 12, 18, 23]) {
    const c = b.chapters.find((x) => x.chapterNumber === n)!;
    const scenes = Array.isArray(c.scenePlan) ? c.scenePlan : [];
    console.log(
      JSON.stringify(
        {
          n,
          sceneCount: scenes.length,
          beats: scenes.map((s) => (s as { beat?: string }).beat),
          summaries: scenes.map((s) =>
            String((s as { summary?: string }).summary ?? "").slice(0, 60),
          ),
        },
        null,
        2,
      ),
    );
  }

  const ledger = getLogicLedger(b);
  console.log(
    JSON.stringify(
      {
        withBeats,
        total: b.chapters.length,
        beatTypes,
        ledger,
        entityKeys: Object.keys(b.knowledgeGraph?.entityStates ?? {}).filter(
          (k) => k.startsWith("__"),
        ),
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
