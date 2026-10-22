/**
 * Inspect assisted-fix / abnahme state for a novel.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-inspect-assisted-fix.ts [novelId]
 */

import { getAssistedFixState, suggestChaptersForAssistedFix } from "@/lib/novel/assisted-fix";
import { getNovelBundle } from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "30799e75-bafc-4b33-8fa9-9edf7f28a4a5";

async function main() {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("nf");
  const fix = getAssistedFixState(b);
  const suggested = suggestChaptersForAssistedFix(b);
  console.log("suggestedCount", suggested.length);
  const ab = b.novel.abnahme;
  console.log(
    JSON.stringify(
      {
        status: b.novel.status,
        label: b.novel.orchestratorStatus.label,
        step: b.novel.orchestratorStatus.step,
        hasAbnahme: Boolean(ab),
        abnahmeOverall: ab?.overall,
        weaknesses: ab?.weaknesses?.slice(0, 5),
        recommendations: ab?.recommendations?.slice(0, 5),
        suggested,
        fix,
        chapterLens: b.chapters
          .slice()
          .sort((a, c) => a.chapterNumber - c.chapterNumber)
          .map((c) => ({
            n: c.chapterNumber,
            status: c.status,
            final: (c.finalText || "").length,
            raw: (c.rawDraft || "").length,
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
