/**
 * Honest snapshot: stored freigabe vs fresh audit.
 * Run: npx tsx --env-file=.env.local scripts/tmp-freigabe-honest.ts
 */
import { getRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  hardManuskriptFreigabeFindings,
  isManuskriptFreigabeReadyForRoman,
  manuskriptFreigabeFingerprint,
} from "../src/lib/roman/editorial";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import { filterFindingsAgainstSettled } from "../src/lib/roman/manuskript-freigabe-settle";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const text = ed.manuskriptText ?? "";
  const stored = ed.manuskriptFreigabe;
  const fpNow = manuskriptFreigabeFingerprint(text);

  console.log({
    storedFindings: stored?.findings?.length ?? 0,
    storedHard: hardManuskriptFreigabeFindings(stored?.findings).length,
    settled: stored?.settled?.length ?? 0,
    fpMatch: stored?.textFingerprint === fpNow,
    freigabeReady: isManuskriptFreigabeReadyForRoman(ed),
    schreibenFertig: ed.pipelineTabFertig?.schreiben ?? false,
  });

  console.log("\n--- stored ---");
  for (const f of stored?.findings ?? []) {
    console.log(
      `  [${f.soft ? "soft" : "HARD"} ${f.source}/${f.kind}] Kap ${f.chapterNumbers.join(",")}: ${f.summary.slice(0, 120)}`,
    );
  }

  console.log("\n--- fresh audit (no settle) ---");
  const fresh = await runFreigabeAudits({
    manuskriptText: text,
    structured: ed.szenenplotStructured ?? null,
    wissensGraph: ed.wissensGraph,
    storyState: ed.storyState,
    charaktere: roman.charaktere,
    tonalitaet: roman.tonalitaet,
  });
  console.log(`fresh ${fresh.length} hard ${hardManuskriptFreigabeFindings(fresh).length}`);
  for (const f of fresh) {
    console.log(
      `  [${f.soft ? "soft" : "HARD"} ${f.source}/${f.kind}] Kap ${f.chapterNumbers.join(",")}: ${f.summary.slice(0, 120)}`,
    );
  }

  const withSettle = filterFindingsAgainstSettled(fresh, stored?.settled);
  console.log(
    `\n--- fresh + settled filter: ${withSettle.length} hard ${hardManuskriptFreigabeFindings(withSettle).length} ---`,
  );
  for (const f of withSettle) {
    console.log(
      `  [${f.soft ? "soft" : "HARD"} ${f.source}/${f.kind}] Kap ${f.chapterNumbers.join(",")}: ${f.summary.slice(0, 120)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
