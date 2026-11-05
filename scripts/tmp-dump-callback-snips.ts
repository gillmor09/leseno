/**
 * Dump callback neighborhoods for a final grammar/pointer check.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const NEEDLES = [
  "aus Kapitel 1",
  "aus Kapitel 2",
  "Gartner, bereits",
  "Cisco-ROI-Rechnung",
  "DataGrail bestätigt",
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 2; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    for (const n of NEEDLES) {
      let from = 0;
      let c = 0;
      while (c < 3) {
        const idx = body.indexOf(n, from);
        if (idx < 0) break;
        const snip = body.slice(Math.max(0, idx - 40), idx + n.length + 160).replace(/\s+/g, " ");
        console.log(`K${i + 1} | ${n} | ${snip}`);
        from = idx + n.length;
        c += 1;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
