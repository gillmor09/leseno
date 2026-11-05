import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import {
  parseSachbuchLayoutBlocks,
  summarizeSachbuchLayoutMarkup,
} from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const h = k.manuscript.herstellungText.trim();
    const body = h || sachbuchKapitelBodyText(k);
    const blocks = h ? parseSachbuchLayoutBlocks(h) : [];
    const merks = blocks.filter((b) => b.type === "box" && b.kind === "merksatz");
    const titled = blocks.filter(
      (b) => b.type === "box" && b.title.trim(),
    );
    console.log(
      `\nK${i + 1} herstellung=${Boolean(h)} words=${body.split(/\s+/).length} merksatz=${merks.length} titledBoxes=${titled.length}`,
    );
    if (h) console.log(" ", summarizeSachbuchLayoutMarkup(h));
    for (const m of merks) {
      console.log(
        "  MERK:",
        JSON.stringify((m.type === "box" ? m.body : "").slice(0, 120)),
      );
    }
    // prose Merksatz: lines
    const proseMerks = [...body.matchAll(/^\s*Merksatz:\s*(.+)$/gim)].map(
      (x) => x[1]!.slice(0, 100),
    );
    if (proseMerks.length) console.log("  prose Merksatz:", proseMerks);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
