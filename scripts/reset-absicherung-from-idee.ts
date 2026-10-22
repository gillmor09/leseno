/**
 * Absicherung Neustart: keep Basics (tonalitaet, kiRegelwerk, grobRegeln, Alter…)
 * and wipe Idee + Spec→Manuskript so the book can be rebuilt through hard gates.
 *
 * Run: npx tsx --env-file=.env.local scripts/reset-absicherung-from-idee.ts [--dry-run]
 */

import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import { resetEditorialFromIdeeKeepingBasics } from "../src/lib/roman/pipeline/cascade";
import {
  getRomanKontext,
  upsertRomanKontext,
} from "../src/lib/roman/repository";

/** Open admin tab: Nur zur Absicherung */
const ROMAN_ID =
  process.env.ROMAN_ID?.trim() || "c7f4c1ad-b4f2-493d-87a5-321e38102300";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const roman = await getRomanKontext(ROMAN_ID);
  if (!roman) {
    throw new Error(`Roman ${ROMAN_ID} nicht gefunden.`);
  }
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const nextEd = resetEditorialFromIdeeKeepingBasics(editorial);

  console.log("Roman:", roman.title, ROMAN_ID);
  console.log("Keep tonalitaet:", (roman.tonalitaet ?? "").slice(0, 80) || "(leer)");
  console.log("Keep kiRegelwerk:", (roman.kiRegelwerk ?? "").slice(0, 80) || "(leer)");
  console.log("Keep grobRegeln:", (editorial.grobRegeln ?? "").slice(0, 80) || "(leer)");
  console.log(
    "Wipe: ideeKurz, recherche, Spec texts, Gerüst, Plot, Manuskript, stageGateOverrides",
  );

  if (dryRun) {
    console.log("[dry-run] no write");
    return;
  }

  await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: "",
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: [],
    weltSchauplaetze: "",
    weltRegeln: "",
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: nextEd,
  });

  console.log("OK — Absicherung ab Idee neu. Nächste Schritte: Idee → Basics → Spec → Gerüst → Plot → Manuskript nur mit grünen Hard-Gates.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
