/**
 * Kap3 Montagsblatt: forward pointer of Frontend-KPIs into Säule 1 / Kap5 cockpit.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const OLD =
  "Ihr Blatt für den Montagmorgen ist der 14-Tage-Sprint. Tage 1 bis 3: Formular-Inventur und Streichkonzert. Tage 4 bis 6: Poka-Yoke und eine Quelle der Wahrheit. Tage 7 bis 9: Freitext-Wüsten in Auswahlmenüs. Tage 10 bis 12: Dashboard-Bau, CSV-Exporte zu. Tage 13 bis 14: Live-Gang und Vorher-Nachher-Messung. Eine Maske, ein Owner, ein Datum.";

const NEU =
  "Ihr Blatt für den Montagmorgen ist der 14-Tage-Sprint. Tage 1 bis 3: Formular-Inventur und Streichkonzert. Tage 4 bis 6: Poka-Yoke und eine Quelle der Wahrheit. Tage 7 bis 9: Freitext-Wüsten in Auswahlmenüs. Tage 10 bis 12: Dashboard-Bau, CSV-Exporte zu. Tage 13 bis 14: Live-Gang und Vorher-Nachher-Messung. Eine Maske, ein Owner, ein Datum. Formular-Abbruchquote und First-Time-Right-Rate aus diesem Sprint fließen später im 9-KPI-Cockpit (Kapitel 5) als Frühindikatoren direkt in Säule 1 – Kosten und Bestand.";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[2]!;
  let t = k.manuscript.improvedText;
  if (!t.includes(OLD)) throw new Error("Montagblatt not found");
  if (t.split(OLD).length - 1 !== 1) throw new Error("Montagblatt not unique");
  t = t.replace(OLD, NEU);
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: t,
    manuscript: { ...k.manuscript, improvedText: t, improvedAt: now },
    updatedAt: now,
  });
  console.log("Kap3 words", countSachbuchWords(t));

  console.log("=== Book score ===");
  const scored = await scoreSachbuchBookManuscript(ID);
  const r = scored.idee.manuscriptReview;
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
