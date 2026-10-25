/**
 * Soften Kap-5 technical entry for non-technical readers, then rescore.
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
  const k = book.kapitel[4]!;
  const t = k.manuscript.improvedText;

  // Dump opening + first technical markers for anchor choice
  console.log("=== OPENING 2500 ===");
  console.log(t.slice(0, 2500));
  console.log("\n=== MARKERS ===");
  for (const term of [
    "Vektor",
    "Gateway",
    "Token",
    "RAG",
    "semantisch",
    "Mittelstands",
    "Copilot",
    "KI-Gateway",
    "Kapitel 5",
  ]) {
    const i = t.indexOf(term);
    if (i >= 0) {
      console.log(`\n[${term} @${i}]`);
      console.log(t.slice(Math.max(0, i - 120), i + 280).replace(/\n/g, " / "));
    }
  }
  console.log("\nwords", countSachbuchWords(t));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
