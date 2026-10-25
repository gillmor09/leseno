import {
  improveAllSachbuchManuscript,
  SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS,
} from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import { setSachbuchGuideStep } from "../src/lib/sachbuch/idee-refine";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const EXTRA = [
  ...SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS,
  "Radikale Konsolidierung: aus den gestapelten Varianten EINEN stringenten Kapitelstrang bauen — keine Copy-Paste-Schleifen.",
  "Jede Studie, jedes Bußgeld und jede Metapher im Kapitel nur EINMAL. ConnectTel einmal einführen und chronologisch durchziehen, ein konsistentes Zahlenwerk.",
  "Längenregel hart: mindestens 90 % der Rohentwurf-Wortzahl. Inhalt behalten, Wiederholungen zusammenziehen, nicht erfinden.",
];

async function main() {
  console.log("Set step manuscript…");
  await setSachbuchGuideStep(ID, "manuscript");
  console.log("Improve-all start", new Date().toISOString());
  const book = await improveAllSachbuchManuscript({
    sachbuchId: ID,
    extraChangeOrders: EXTRA,
  });
  console.log("Improve-all done", new Date().toISOString());
  for (const k of book.kapitel) {
    const draft = countSachbuchWords(k.manuscript.draftText);
    const improved = countSachbuchWords(k.manuscript.improvedText);
    const pct = draft ? Math.round((100 * improved) / draft) : 0;
    const marks = (k.manuscript.improvedText.match(/#|\*{1,2}/g) || []).length;
    console.log(
      `${k.title}: score=${k.manuscript.salesScore} ${improved}/${draft} (${pct}%) marks=${marks}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
