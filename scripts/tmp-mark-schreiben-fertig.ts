import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  hardManuskriptFreigabeFindings,
  isManuskriptFreigabeReadyForRoman,
  withPipelineTabFertig,
} from "../src/lib/roman/editorial";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const hard = hardManuskriptFreigabeFindings(ed.manuskriptFreigabe?.findings).length;
  console.log({
    findings: ed.manuskriptFreigabe?.findings?.length ?? 0,
    hard,
    freigabeReady: isManuskriptFreigabeReadyForRoman(ed),
    pipelineTabFertig: ed.pipelineTabFertig,
  });
  if (hard > 0) {
    console.log("still hard findings — not marking fertig");
    return;
  }
  if (ed.pipelineTabFertig?.schreiben) {
    console.log("already fertig");
    return;
  }
  const nextEd = withPipelineTabFertig(ed, "schreiben", true);
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
  console.log("schreiben fertig gesetzt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
