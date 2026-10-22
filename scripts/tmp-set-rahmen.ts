/**
 * One-shot: set Altersklasse / Lesestufe / Richtungen / Perspektive / Zeitform
 * for „Stiller Widerspruch“, then re-approve the Rahmen phase (metadata only).
 * Run: npx tsx --env-file=.env.local scripts/tmp-set-rahmen.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import { approvePhase } from "../src/lib/roman/phase-state";
import { fingerprintForPhase } from "../src/lib/roman/phase-fingerprints";

const ROMAN_ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const r = await getRomanKontext(ROMAN_ID);
  if (!r) throw new Error("missing");
  const ed0 = r.editorial;
  const perspektive =
    r.perspektive.trim() ||
    "Personale Erzählperspektive (3. Person), wechselnd nah — vorwiegend Hartmut, kapitelweise Eva";
  const zeitform = r.zeitform.trim() || "Präteritum";
  const ed1 = {
    ...ed0,
    zielAlterMin: 18,
    zielAlterMax: null,
    lesestufe: "Erwachsene / allgemeine Belletristik",
    richtungen: ["lustig", "nachdenklich"],
  };
  const roman1 = { ...r, perspektive, zeitform, editorial: ed1 };
  const fp = fingerprintForPhase("rahmen", roman1);
  const ed2 = approvePhase(ed1, "rahmen", fp);
  await upsertRomanKontext({
    id: r.id,
    title: r.title,
    manuskriptRaw: r.manuskriptRaw,
    stilbibel: r.stilbibel,
    genre: r.genre,
    praemisse: r.praemisse,
    perspektive,
    zeitform,
    tonalitaet: r.tonalitaet,
    charaktere: r.charaktere,
    weltSchauplaetze: r.weltSchauplaetze,
    weltRegeln: r.weltRegeln,
    szenenRaster: r.szenenRaster,
    kiRegelwerk: r.kiRegelwerk,
    fanPersonaName: r.fanPersonaName,
    fanPersonaProfil: r.fanPersonaProfil,
    editorial: ed2,
  });
  const check = await getRomanKontext(ROMAN_ID);
  if (!check) throw new Error("reload failed");
  const fpNow = fingerprintForPhase("rahmen", check);
  console.log("alter:", check.editorial.zielAlterMin, check.editorial.zielAlterMax);
  console.log("lesestufe:", check.editorial.lesestufe);
  console.log("richtungen:", check.editorial.richtungen);
  console.log("perspektive:", check.perspektive, "| zeitform:", check.zeitform);
  console.log("rahmen approved fp match:", check.editorial.phaseState?.rahmen?.fingerprint === fpNow, check.editorial.phaseState?.rahmen?.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
