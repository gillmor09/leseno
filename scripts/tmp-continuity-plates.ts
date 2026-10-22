/**
 * Diagnose Kennzeichen identity flip-flops.
 * Run: npx tsx --env-file=.env.local scripts/tmp-continuity-plates.ts
 */
import { getRomanKontext } from "../src/lib/roman/repository";
import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import {
  applyManuskriptContinuityFixes,
  scanIdentityContinuityFixes,
  scanManuskriptContinuity,
} from "../src/lib/roman/manuskript-continuity-pass";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const g = ed.wissensGraph;
  const ms = ed.manuskriptText ?? "";

  for (const n of g?.nodes ?? []) {
    if (n.kind !== "prop" && n.kind !== "place") continue;
    const attrs = Object.entries(n.attrs ?? {}).filter(
      ([k, v]) =>
        Boolean(v) &&
        /kennzeichen|plate|material|nummern|farbe/i.test(k),
    );
    if (attrs.length) {
      console.log(`NODE ${n.label}:`, Object.fromEntries(attrs));
    }
  }

  const identity = scanIdentityContinuityFixes(ms, g);
  console.log(`\nidentity fixes: ${identity.length}`);
  for (const f of identity) {
    console.log(
      `  Kap ${f.chapter}: ${JSON.stringify(f.find).slice(0, 50)} → ${JSON.stringify(f.replace).slice(0, 50)} | ${f.reason}`,
    );
  }

  const scan = await scanManuskriptContinuity({
    sourceText: ms,
    target: "manuskript",
    wissensGraph: g,
    charaktere: roman.charaktere,
    skipAliasLlm: true,
  });
  console.log(`\nfull scan: ${scan.summary}`);

  if (scan.fixes.length) {
    const applied = applyManuskriptContinuityFixes({
      sourceText: ms,
      docFormat: "manuskript",
      wissensGraph: g,
      fixes: scan.fixes,
    });
    console.log(
      `apply dry: applied=${applied.appliedCount}/${scan.fixes.length} textChanged=${applied.text !== ms}`,
    );
    const again = scanIdentityContinuityFixes(applied.text, applied.wissensGraph);
    console.log(`after apply identity left: ${again.length}`);
    for (const f of again.slice(0, 8)) {
      console.log(`  STILL Kap ${f.chapter}: ${f.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
