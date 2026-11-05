/**
 * Find Infobox/Schaubild/Tabelle mentions vs stored graphics.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-table-refs.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import {
  parseSachbuchLayoutBlocks,
  stripSachbuchLayoutMarkup,
} from "../src/lib/sachbuch/herstellung-markup";
import { sachbuchKapitelInfografiken } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const body = k.manuscript.herstellungText.trim() || sachbuchKapitelExportBody(k);
    const plain = stripSachbuchLayoutMarkup(body);
    const blocks = parseSachbuchLayoutBlocks(body);
    const infos = sachbuchKapitelInfografiken(k);

    const tableHits = [
      ...plain.matchAll(/[^\n.]{0,40}[Tt]abelle[^\n.]{0,80}/g),
    ].map((m) => m[0]!.replace(/\s+/g, " ").trim());

    const boxes = blocks.filter((b) => b.type === "box");
    const schaubilder = boxes.filter(
      (b) => b.type === "box" && b.kind === "schaubild",
    );

    if (!tableHits.length && !schaubilder.length && !infos.length) continue;

    console.log(`\n=== K${i + 1} ${k.title} ===`);
    console.log(`infos stored: ${infos.map((x) => x.title).join(" | ") || "—"}`);
    for (const t of tableHits) console.log(`  TABLE-REF: ${t}`);
    for (const b of boxes) {
      if (b.type !== "box") continue;
      const snippet = b.body.replace(/\s+/g, " ").slice(0, 160);
      console.log(`  BOX ${b.kind}: ${b.title || "(no title)"}`);
      console.log(`    ${snippet}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
