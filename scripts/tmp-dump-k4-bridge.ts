import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t4 = sachbuchKapitelBodyText(book.kapitel[3]!);
  const t5 = sachbuchKapitelBodyText(book.kapitel[4]!);

  console.log("K5 title:", book.kapitel[4]!.title);
  console.log("K6 title:", book.kapitel[5]!.title);

  for (const n of [
    "Vom schlanken Durchsatz zur belastbaren Datenqualität",
    "Stammdatenqualität",
    "Fairness",
    "nächste Kapitel",
    "Folgekapitel",
    "als Nächstes",
    "Retention",
    "Privacy Debt",
    "Drop-Partition",
    "Speicherbegrenzung",
  ]) {
    let from = 0;
    let c = 0;
    while (c < 3) {
      const i = t4.indexOf(n, from);
      if (i < 0) break;
      console.log(`\nK4[${n}@${i}]:`, JSON.stringify(t4.slice(Math.max(0, i - 80), i + 220)));
      from = i + n.length;
      c++;
    }
  }

  console.log("\n===== K4 last 1200 =====\n", t4.slice(-1200));
  console.log("\n===== K5 first 500 =====\n", t5.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
