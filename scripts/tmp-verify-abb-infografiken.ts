/**
 * Verify Abbildung captions ↔ stored Infografik titles.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-verify-abb-infografiken.ts
 */
import {
  sachbuchInfografikBriefsForBook,
  sachbuchKapitelInfografiken,
} from "../src/lib/sachbuch/infografik";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const briefs = sachbuchInfografikBriefsForBook(book);
  let ok = true;

  console.log("=== Briefs vs stored ===");
  for (const b of briefs) {
    const kap = book.kapitel[b.kapitelIndex]!;
    const hit = sachbuchKapitelInfografiken(kap).find(
      (i) => i.title.trim() === b.title.trim(),
    );
    const line = `K${b.kapitelIndex + 1} ${b.key}: ${hit ? "OK" : "MISSING"} — ${b.title}`;
    console.log(line);
    if (!hit) ok = false;
  }

  console.log("\n=== Extra graphics (should be empty) ===");
  for (let i = 0; i < book.kapitel.length; i++) {
    const allowed = new Set(
      briefs.filter((b) => b.kapitelIndex === i).map((b) => b.title.trim()),
    );
    const extras = sachbuchKapitelInfografiken(book.kapitel[i]!).filter(
      (x) => !allowed.has(x.title.trim()),
    );
    if (extras.length) {
      ok = false;
      console.log(
        `K${i + 1}: ${extras.map((e) => e.title).join(" | ")}`,
      );
    }
  }

  console.log("\n=== Caption lines in text ===");
  for (let i = 0; i < book.kapitel.length; i++) {
    const plain = stripSachbuchLayoutMarkup(
      sachbuchKapitelExportBody(book.kapitel[i]!),
    );
    const abb = [
      ...plain.matchAll(/Abbildung\s*[\d.]+\s*[:：]?\s*[^\n]{0,100}/gi),
    ].map((m) => m[0]!.replace(/\s+/g, " ").trim());
    if (!abb.length) continue;
    console.log(`K${i + 1}:`);
    for (const a of abb) console.log(`  ${a}`);
  }

  if (!ok) {
    console.error("\nVERIFY FAILED");
    process.exit(1);
  }
  console.log("\nVERIFY OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
