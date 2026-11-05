/**
 * Generate Abbildung Infografiken (Gemini 3 Pro Image).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-sachbuch-infografiken.ts [--force]
 */
import {
  generateAllSachbuchInfografiken,
  sachbuchInfografikBriefsForBook,
  sachbuchKapitelInfografiken,
} from "../src/lib/sachbuch/infografik";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const force = process.argv.includes("--force");
  console.log("Generating Infografiken…", { force });
  const book = await generateAllSachbuchInfografiken({
    sachbuchId: ID,
    force,
    onProgress: (label) => console.log(label),
  });
  const briefs = sachbuchInfografikBriefsForBook(book);
  console.log("\n=== Result ===");
  for (const b of briefs) {
    const kap = book.kapitel[b.kapitelIndex]!;
    const hit = sachbuchKapitelInfografiken(kap).find(
      (i) => i.title.trim() === b.title.trim(),
    );
    console.log(
      `K${b.kapitelIndex + 1} ${b.key}: ${hit ? "OK" : "MISSING"} — ${b.title}`,
    );
  }
  for (let i = 0; i < book.kapitel.length; i++) {
    const list = sachbuchKapitelInfografiken(book.kapitel[i]!);
    if (!list.length) continue;
    console.log(
      `Kap${i + 1} total: ${list.length} → ${list.map((x) => x.title).join(" | ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
