/**
 * Refresh Manuskript Freigabe findings after phrase-scanner fix.
 * Run: npx tsx --env-file=.env.local scripts/tmp-refresh-freigabe-phrases.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
} from "../src/lib/roman/editorial";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import { scanManuskriptPhraseFrequency } from "../src/lib/roman/manuskript-phrase-freq";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const text = (ed.manuskriptText ?? "").trim();
  const phraseHits = scanManuskriptPhraseFrequency(text, {
    minCount: 3,
    minChapters: 2,
    maxHits: 8,
  });
  console.log(
    "craft phrases:",
    phraseHits.map((h) => `${h.phrase} (${h.count})`),
  );

  const findings = await runFreigabeAudits({
    manuskriptText: text,
    structured: ed.szenenplotStructured ?? null,
    wissensGraph: ed.wissensGraph,
    storyState: ed.storyState,
    charaktere: roman.charaktere,
    tonalitaet: roman.tonalitaet,
  });
  const style = findings.filter((f) => f.source === "style");
  console.log(
    `findings ${findings.length} style ${style.length}`,
    style.map((f) => f.summary.slice(0, 100)),
  );

  const freigabe = {
    checkedAt: new Date().toISOString(),
    textFingerprint: manuskriptFreigabeFingerprint(text),
    findings,
    overrideAt: null as string | null,
  };
  await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: withManuskriptFreigabe(ed, freigabe),
  });
  console.log("freigabe refreshed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
