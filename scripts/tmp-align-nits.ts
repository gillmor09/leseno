import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const K3_OLD = `Arbeitsvorlage 14-Tage-Sprint. Tage 1 bis 3: Zielmaske und Pflichtfelder benennen. Tage 4 bis 6: Freitext durch Auswahlwerte ersetzen. Tage 7 bis 9: ungenutzte Felder streichen. Tage 10 bis 12: Exporte kappen und Löschfrist setzen. Tage 13 bis 14: Owner zeichnet ab. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K3_NEW = `Arbeitsvorlage 14-Tage-Sprint. Tage 1 bis 3: Formular-Inventur und Streichkonzert. Tage 4 bis 6: Poka-Yoke-Quellvalidierung und Single Source of Truth. Tage 7 bis 9: Freitext-Wüsten in Auswahlmenüs umbauen. Tage 10 bis 12: Dashboard-Bau und CSV-Exporte abschalten. Tage 13 bis 14: Live-Gang und Vorher-Nachher-Messung. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K5_OLD = `Latenzzeit bei der Berechtigungsbereinigung unter neunzig Tagen`;
const K5_NEW = `Latenzzeit bei der Berechtigungsbereinigung unter 24 Stunden`;

async function patch(i: number, old: string, neu: string, label: string) {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[i]!;
  if (!k.manuscript.improvedText.includes(old)) {
    throw new Error(`${label}: nicht gefunden`);
  }
  const text = k.manuscript.improvedText.replace(old, neu);
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: text,
    manuscript: { ...k.manuscript, improvedText: text, improvedAt: now },
    updatedAt: now,
  });
  console.log(label, "ok");
}

async function main() {
  await patch(2, K3_OLD, K3_NEW, "Kap3 Tage");
  await patch(4, K5_OLD, K5_NEW, "Kap5 Latenz");
  const book = await scoreSachbuchBookManuscript(ID);
  const r = book.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r.salesScore,
        summary: r.scoreSummary,
        gaps: r.gaps,
        orders: r.changeOrders,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
