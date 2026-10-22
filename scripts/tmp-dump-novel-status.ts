/**
 * Dump novel orchestrator + chapter snapshot.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-novel-status.ts [novelId]
 */
import { getNovelBundle } from "@/lib/novel/repository";
import {
  getWaveState,
  formatWaveLabel,
  waveReviewComplete,
} from "@/lib/novel/wave-batch";

const NOVEL_ID =
  process.argv[2]?.trim() || "baabff2c-1001-49f5-9a38-842db21a13fa";

async function main() {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("not found");
  const o = b.novel.orchestratorStatus;
  const wave = getWaveState(b);
  const chapters = b.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber);
  console.log(
    JSON.stringify(
      {
        status: b.novel.status,
        phase: o.phase,
        step: o.step,
        ch: o.chapterNumber,
        label: o.label,
        error: o.error,
        updated: o.updatedAt,
        wave,
        waveLabel: formatWaveLabel(wave),
        waveComplete: waveReviewComplete(wave, b),
        chapters: chapters.map((c) => ({
          n: c.chapterNumber,
          status: c.status,
          scenes: c.scenePlan?.length ?? 0,
          raw: (c.rawDraft || "").length,
          final: (c.finalText || "").length,
        })),
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
