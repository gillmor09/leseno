/**
 * Kap3 → Säule-1 forward pointer for Formular-Abbruchquote / First-Time-Right.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[2]!;
  let t = k.manuscript.improvedText;

  const idx = t.indexOf("Ihr Blatt für den Montagmorgen");
  console.log("Montag idx", idx);
  console.log(t.slice(idx, idx + 700));
  console.log("\n=== LAST 900 ===\n");
  console.log(t.slice(-900));

  // Also find First-Time / Abbruch mentions near end
  for (const term of [
    "First-Time",
    "Abbruchquote",
    "Formular-Abbruch",
    "14-Tage",
  ]) {
    let i = 0;
    let c = 0;
    while ((i = t.lastIndexOf(term, i === 0 ? t.length : i - 1)) >= 0 && c < 2) {
      console.log(`\n[${term} @${i}]`, t.slice(Math.max(0, i - 80), i + 160).replace(/\n/g, " / "));
      i = i;
      c++;
      break;
    }
  }

  void countSachbuchWords;
  void scoreSachbuchBookManuscript;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
