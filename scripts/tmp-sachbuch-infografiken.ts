/**
 * Generate curated Lean-Privacy Infografiken (Gemini 3 Pro Image).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-sachbuch-infografiken.ts
 */
import { generateAllSachbuchInfografiken } from "../src/lib/sachbuch/infografik";
import { sachbuchKapitelHasInfografik } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const force = process.argv.includes("--force");
  console.log("Generating Infografiken…", { force });
  const book = await generateAllSachbuchInfografiken({
    sachbuchId: ID,
    force,
    onProgress: (label) => console.log(label),
  });
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    console.log(
      `Kap${i + 1}: ${sachbuchKapitelHasInfografik(k) ? "OK" : "—"} ${k.infografikTitle || ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
