/**
 * Print first/last prose snippets after each heading for Merksatz anchors.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-chapter-snips.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { parseSachbuchLayoutBlocks } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const want = [0, 1, 2, 4, 5, 6, 7, 8];
  for (const i of want) {
    const k = book.kapitel[i]!;
    const blocks = parseSachbuchLayoutBlocks(k.manuscript.herstellungText);
    console.log(`\n==== K${i + 1} ${k.title} ====`);
    for (const b of blocks) {
      if (b.type === "heading") {
        console.log(`\n## ${b.text}`);
        continue;
      }
      if (b.type !== "prose") continue;
      const paras = b.text
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      for (const p of paras.slice(0, 2)) {
        console.log(`  > ${p.slice(0, 200)}`);
      }
      if (paras.length > 4) {
        for (const p of paras.slice(-2)) {
          console.log(`  < ${p.slice(0, 200)}`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
