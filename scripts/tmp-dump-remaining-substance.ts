import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits = [
      ...t.matchAll(
        /Baymard|Gartner|DataGrail|Cisco|1[.,]400|1-10-100|Poka-Yoke|RAG-Assistent|Ticket-Archiv|45\.000|Montag-Mittwoch|noch in dieser Woche mit drei/gi,
      ),
    ];
    if (!hits.length) {
      console.log(`K${i + 1}: clean`);
      continue;
    }
    console.log(`\nK${i + 1}: ${hits.length} hits`);
    for (const m of hits.slice(0, 12)) {
      const idx = m.index ?? 0;
      console.log(
        `  [${m[0]}]`,
        t.slice(Math.max(0, idx - 70), idx + 160).replace(/\s+/g, " "),
      );
    }
  }

  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  const i = t9.search(/RAG|Assistenten|Ticket-Archiv|fünf Jahre/i);
  console.log("\n=== K9 window ===\n", t9.slice(Math.max(0, i - 200), i + 1800));

  const t6 = sachbuchKapitelBodyText(book.kapitel[5]!);
  const j = t6.indexOf("Gartner");
  console.log("\n=== K6 Gartner ===\n", t6.slice(Math.max(0, j - 150), j + 400));
}

main();
