/**
 * Why Continuity/Canon still flags Kennzeichen.
 * Run: npx tsx --env-file=.env.local scripts/tmp-canon-plate-diag.ts
 */
import { getRomanKontext } from "../src/lib/roman/repository";
import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import {
  scanIdentityContinuityFixes,
  scanManuskriptContinuity,
} from "../src/lib/roman/manuskript-continuity-pass";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const ms = ed.manuskriptText ?? "";
  const g = ed.wissensGraph;

  console.log("--- Graph kennzeichen ---");
  for (const n of g?.nodes ?? []) {
    const k =
      n.attrs?.kennzeichen || n.attrs?.nummernschild || n.attrs?.plate;
    if (k) console.log(`  ${n.label}: ${k}`);
  }

  console.log("--- MS plates by chapter ---");
  const re = /E-HS\s*\d+/gi;
  for (const ch of parsePlotChapters(ms)) {
    const plates = [...ch.body.matchAll(re)].map((m) => m[0]);
    if (plates.length) console.log(`  Kap ${ch.number}: ${plates.join(", ")}`);
  }

  const identity = scanIdentityContinuityFixes(ms, g);
  console.log(`\nidentity fixes: ${identity.length}`);
  for (const f of identity) {
    console.log(`  Kap ${f.chapter}: ${f.find} → ${f.replace} | ${f.reason}`);
  }

  const scan = await scanManuskriptContinuity({
    sourceText: ms,
    target: "manuskript",
    wissensGraph: g,
    charaktere: roman.charaktere,
    skipAliasLlm: true,
  });
  console.log(`\nfull: ${scan.summary}`);
  for (const f of scan.fixes.filter((x) => x.kind === "identity")) {
    console.log(`  [${f.kind}] Kap ${f.chapter}: ${f.reason}`);
  }

  const freigabe = ed.manuskriptFreigabe?.findings ?? [];
  console.log("\nfreigabe canon:");
  for (const f of freigabe.filter((x) => x.source === "canon")) {
    console.log(`  Kap ${f.chapterNumbers.join(",")}: ${f.summary}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
