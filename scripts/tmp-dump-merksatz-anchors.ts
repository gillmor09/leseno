/**
 * Dump short prose anchors per chapter for Merksatz placement.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-merksatz-anchors.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { parseSachbuchLayoutBlocks } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const h = k.manuscript.herstellungText.trim();
    if (!h) continue;
    const blocks = parseSachbuchLayoutBlocks(h);
    console.log(`\n==== K${i + 1} ${k.title} ====`);
    for (const b of blocks) {
      if (b.type === "heading") {
        console.log(`\n## ${b.text}`);
        continue;
      }
      if (b.type === "box") {
        console.log(`[BOX ${b.kind}${b.title ? ` | ${b.title}` : ""}]`);
        continue;
      }
      const paras = b.text
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      for (const p of paras) {
        if (p.length < 70 || p.length > 320) continue;
        if (!/[.!?]$/.test(p)) continue;
        console.log(`· ${p}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
