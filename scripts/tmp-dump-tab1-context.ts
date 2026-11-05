/**
 * Dump Tabelle/Abbildung captions + check export chapter wiring.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchExportChapters } from "../src/lib/sachbuch/export-build";
import {
  sachbuchKapitelExportBody,
  sachbuchKapitelInfografiken,
} from "../src/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const plain = stripSachbuchLayoutMarkup(sachbuchKapitelExportBody(k));
    const caps = [
      ...plain.matchAll(
        /(?:Abbildung|Tabelle)\s*[\d.]+\s*[:：][^\n]{0,200}/gi,
      ),
    ].map((m) => m[0]!.replace(/\s+/g, " ").trim());
    if (!caps.length) continue;
    console.log(`\nK${i + 1}:`);
    for (const c of caps) console.log(`  ${c}`);
    // Context around Tabelle 1
    const idx = plain.search(/Tabelle\s*1\s*:/i);
    if (idx >= 0) {
      console.log("--- context ---");
      console.log(plain.slice(Math.max(0, idx - 200), idx + 400).replace(/\s+/g, " "));
    }
  }

  const chapters = sachbuchExportChapters(book);
  console.log("\n=== export chapters ===");
  for (const c of chapters) {
    const n = c.infografikDataUrls?.length ?? 0;
    const first = c.infografikDataUrls?.[0]?.slice(0, 32) ?? "";
    console.log(
      `ch${c.number}: body=${c.body.length} infos=${n} first=${first}`,
    );
  }

  // Per-kapitel stored sizes
  console.log("\n=== stored ===");
  for (let i = 0; i < book.kapitel.length; i++) {
    const list = sachbuchKapitelInfografiken(book.kapitel[i]!);
    if (!list.length) continue;
    console.log(
      `K${i + 1}:`,
      list.map((x) => `${x.title} (${Math.round(x.dataUrl.length / 1024)}kb)`).join(" | "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
