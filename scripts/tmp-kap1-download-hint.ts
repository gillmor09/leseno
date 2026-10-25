/**
 * Kap1 Montagsblatt: early download hint for leseno.de/lean-privacy.
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
  const k = book.kapitel[0]!;
  let t = k.manuscript.improvedText;
  const idx = t.indexOf("Ihr Blatt für den Montagmorgen");
  if (idx < 0) throw new Error("Montag not found");
  console.log(t.slice(idx, idx + 800));
  console.log("\n--- has download?", t.includes("leseno.de/lean-privacy"));
  void countSachbuchWords;
  void scoreSachbuchBookManuscript;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
