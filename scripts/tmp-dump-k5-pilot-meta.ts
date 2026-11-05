import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[4]!);

  for (const n of [
    "Support-Pilot",
    "Blaupause",
    "Bereichserfolg",
    "unternehmensweit",
    "Reifegrad",
    "zweite Betriebsjahr",
    "zweiten Betriebsjahr",
    "Etappe 1",
    "Was folgt",
    "Wertschöpfungspyramide",
    "Qualitäts-Pyramide",
    "VDP",
    "operative Basis",
    "Nachweissystem",
  ]) {
    let from = 0;
    let c = 0;
    while (c < 4) {
      const i = t.indexOf(n, from);
      if (i < 0) break;
      console.log(`\n[${n}@${i}]`, JSON.stringify(t.slice(Math.max(0, i - 100), i + 280)));
      from = i + n.length;
      c++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
