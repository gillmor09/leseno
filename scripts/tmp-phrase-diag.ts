/**
 * Diagnose Formulierungs-Variation hits vs manuskript.
 * Run: npx tsx --env-file=.env.local scripts/tmp-phrase-diag.ts
 */
import { getRomanKontext } from "../src/lib/roman/repository";
import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import { scanManuskriptPhraseFrequency } from "../src/lib/roman/manuskript-phrase-freq";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const ms = ed.manuskriptText ?? "";
  const freigabe = ed.manuskriptFreigabe?.findings ?? [];
  console.log(
    "freigabe style:",
    freigabe
      .filter((f) => f.source === "style")
      .map((f) => f.summary.slice(0, 120)),
  );
  const hits = scanManuskriptPhraseFrequency(ms, {
    minCount: 3,
    minChapters: 2,
    maxHits: 12,
  });
  console.log(`hits ${hits.length}`);
  const chapters = parsePlotChapters(ms);
  for (const h of hits.slice(0, 8)) {
    console.log(`\n„${h.phrase}“ count=${h.count} caps=${h.chapterNumbers.join(",")}`);
    for (const n of h.chapterNumbers.slice(0, 4)) {
      const body = chapters.find((c) => c.number === n)?.body ?? "";
      const lc = body.toLowerCase();
      const idx = lc.indexOf(h.phrase);
      const snip =
        idx >= 0
          ? body.slice(Math.max(0, idx - 20), idx + h.phrase.length + 40).replace(/\s+/g, " ")
          : "(no exact token join match in body)";
      console.log(`  Kap ${n}: …${snip}…`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
