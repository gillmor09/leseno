/**
 * Dump abnahme + light tic scan for a novel.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-novel-abnahme.ts [novelId]
 */

import { detectNovelProseTics } from "@/lib/novel/prose-tic-detect";
import { getNovelBundle } from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "7d66e3a4-6155-4576-a19d-f51df437decf";

async function main(): Promise<void> {
  const bundle = await getNovelBundle(NOVEL_ID);
  if (!bundle) throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);

  console.log("title:", bundle.novel.title);
  console.log("status:", bundle.novel.status);
  console.log("chapters:", bundle.chapters.length);
  console.log("abnahme:", JSON.stringify(bundle.novel.abnahme, null, 2));

  const chapters = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  let hitCh = 0;
  let endAphorism = 0;
  const samples: string[] = [];

  for (const c of chapters) {
    const text = (c.finalText || c.rawDraft).trim();
    if (text.length < 80) continue;
    const hits = detectNovelProseTics(text);
    if (!hits.length) continue;
    hitCh += 1;
    if (hits.some((h) => h.code === "chapter_end_aphorism")) endAphorism += 1;
    const end = text.slice(-220).replace(/\s+/g, " ");
    samples.push(
      `Kap ${c.chapterNumber}: ${hits.map((h) => h.code).join(",")} | …${end}`,
    );
  }

  console.log("\ntic-scan:", { hitChapters: hitCh, endAphorismChapters: endAphorism });
  console.log(samples.slice(0, 12).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
