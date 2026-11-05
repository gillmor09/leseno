/**
 * Scan Abbildung refs vs Infografik/Schaubild slots.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-abbildungen.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import {
  parseSachbuchLayoutBlocks,
  stripSachbuchLayoutMarkup,
} from "../src/lib/sachbuch/herstellung-markup";
import { sachbuchInfografikBriefsForBook } from "../src/lib/sachbuch/infografik";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const briefs = sachbuchInfografikBriefsForBook(book);
  console.log("\n=== Infografik briefs (Gemini) ===");
  for (const b of briefs) {
    const kap = book.kapitel[b.kapitelIndex]!;
    const has = Boolean(kap.infografikDataUrl?.startsWith("data:image/"));
    console.log(
      `K${b.kapitelIndex + 1}: ${has ? "YES" : "NO"} — ${b.title}`,
    );
  }

  console.log("\n=== Abbildung / Schaubild refs in text ===");
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const body = sachbuchKapitelExportBody(k);
    const plain = stripSachbuchLayoutMarkup(body);
    const blocks = parseSachbuchLayoutBlocks(
      k.manuscript.herstellungText.trim() || body,
    );
    const schaubilder = blocks.filter(
      (b) => b.type === "box" && b.kind === "schaubild",
    );

    const abb = [
      ...plain.matchAll(
        /Abbildung\s*\d+\s*[:：]?\s*[^\n]{0,120}/gi,
      ),
    ].map((m) => m[0]!.replace(/\s+/g, " ").trim());
    const schaubildMentions = [
      ...plain.matchAll(
        /(?:Schaubild|auf einen Blick)[^\n.]{0,80}/gi,
      ),
    ].map((m) => m[0]!.replace(/\s+/g, " ").trim());

    if (!abb.length && !schaubilder.length && !schaubildMentions.length) {
      continue;
    }
    console.log(`\nK${i + 1} ${k.title}`);
    for (const a of abb) console.log(`  ABB: ${a}`);
    for (const s of schaubildMentions.slice(0, 6)) {
      console.log(`  mention: ${s}`);
    }
    for (const s of schaubilder) {
      if (s.type !== "box") continue;
      console.log(`  BOX schaubild: ${s.title || "(untitled)"}`);
      console.log(`    body: ${s.body.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
