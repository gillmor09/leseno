/**
 * Kap. 13 + 15: wrong plate → E-HS 1958
 * (User asked 2046; live text has E-HS 4411 in those chapters.)
 * Run: npx tsx --env-file=.env.local scripts/tmp-fix-plate-ch13-15.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import {
  parsePlotChapters,
  serializeManuskriptChapters,
} from "../src/lib/roman/plot-chapters";
import { retainApprovedStructureFingerprints } from "../src/lib/roman/phase-fingerprints";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";
const FROM = /E-HS\s*(?:2046|4411)/gi;
const TO = "E-HS 1958";
const TARGET_CH = new Set([13, 15]);

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const before = ed.manuskriptText ?? "";
  const chapters = parsePlotChapters(before);
  let hits = 0;
  const next = chapters.map((ch) => {
    if (!TARGET_CH.has(ch.number)) return ch;
    const matches = ch.body.match(FROM) ?? [];
    if (matches.length < 1) {
      console.log(`Kap ${ch.number}: nichts zu ersetzen`);
      return ch;
    }
    hits += matches.length;
    console.log(`Kap ${ch.number}: ${matches.join(", ")} → ${TO}`);
    return { ...ch, body: ch.body.replace(FROM, TO) };
  });
  if (hits < 1) {
    console.log("nothing to change");
    return;
  }
  const text = serializeManuskriptChapters(next);
  const nextEd = retainApprovedStructureFingerprints({
    ...ed,
    manuskriptText: text,
    manuskriptFreigabe: ed.manuskriptFreigabe
      ? {
          ...ed.manuskriptFreigabe,
          textFingerprint: "stale-after-plate-ch13-15",
        }
      : null,
  });
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
    editorial: nextEd,
  });
  const check = await getRomanKontext(ID, { omitCover: true });
  const afterCh = parsePlotChapters(check?.editorial?.manuskriptText ?? "");
  for (const n of [13, 15]) {
    const body = afterCh.find((c) => c.number === n)?.body ?? "";
    const plates = [
      ...body.matchAll(/E-HS\s*\d+/gi),
    ].map((m) => m[0]);
    console.log(`Kap ${n} after:`, plates);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
