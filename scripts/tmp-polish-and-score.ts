/**
 * Targeted manuscript polish (3 book change-orders) + holistic book re-score.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const BOX_K1 = `

Hinweis für Buchsatz und Grafik: Die Chargeback-Rechnung der unsichtbaren Datenkosten und die Übersicht der drei Kern-KPIs gegen Daten-Überbestand sind im Druckbild als visuell abgesetzte Infokästen bzw. ausfüllbare Vorlagen zu gestalten.
`;

const BOX_K2 = `

Hinweis für Buchsatz und Grafik: Der 6-Fragen-Prozesssteckbrief ist im Druckbild als ganzseitige, visuell abgesetzte Vorlage mit Eintragungsfeldern zum direkten Ausfüllen zu gestalten.
`;

const BOX_K3 = `

Hinweis für Buchsatz und Grafik: Der 14-Tage-Sprint-Plan ist im Druckbild als visuell abgesetzte Sprint-Tafel mit offenen Feldern für Zielmaske, Owner und Vollzugsdatum zu gestalten.
`;

const BOX_K5 = `

Hinweis für Buchsatz und Grafik: A3-Report, 9-KPI-Cockpit und 5-Monats-Masterplan sind im Druckbild als visuell abgesetzte Vorlagen bzw. Übersichtstafeln zu gestalten.
`;

const CTA_K5 = `

Wenn Sie die Artefakte aus diesem Buch — Chargeback-Rechnung, 6-Fragen-Prozesssteckbrief, Sprint-Boards und das 9-KPI-Dashboard — als direkt nutzbare Vorlagen brauchen, finden Sie das Companion-Pack auf der Buch-Website des Autors. Dort lassen sich die Arbeitsblätter herunterladen und sofort im eigenen Team einsetzen.
`;

function ensureSuffix(text: string, block: string): string {
  const needle = block.trim().slice(0, 40);
  if (text.includes(needle)) return text.trimEnd();
  return `${text.trimEnd()}\n${block.trimStart()}`;
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // --- Kap 4: ConnectTel continuity ---
  const k4 = book.kapitel[3]!;
  let t4 = k4.manuscript.improvedText;
  const old4 =
    "Wie schlagkräftig die Verbindung aus Wertstromanalyse und gezieltem Schuldenabbau in der Praxis wirkt, beweist das anonymisierte Praxisbeispiel unseres mittelständischen Telekommunikationsanbieters – nennen wir ihn auch in diesem Kapitel ConnectTel.";
  const new4 =
    "Wie schlagkräftig die Verbindung aus Wertstromanalyse und gezieltem Schuldenabbau in der Praxis wirkt, zeigte sich auch im weiteren Umbau bei ConnectTel.";
  if (!t4.includes(old4)) {
    throw new Error("Kap 4 ConnectTel-Phrase nicht gefunden.");
  }
  t4 = t4.replace(old4, new4);
  console.log(
    "Kap4 snippet:",
    t4.match(/.{0,40}zeigte sich auch im weiteren Umbau bei ConnectTel.{0,40}/)?.[0],
  );

  const now = new Date().toISOString();
  book = await patchSachbuchKapitel(ID, k4.id, {
    finalText: t4,
    manuscript: {
      ...k4.manuscript,
      improvedText: t4,
      improvedAt: now,
    },
    updatedAt: now,
  });
  console.log("Kap4 patched, words", countSachbuchWords(t4));

  // --- Kap 1,2,3,5: layout hints ---
  const boxes: { idx: number; block: string }[] = [
    { idx: 0, block: BOX_K1 },
    { idx: 1, block: BOX_K2 },
    { idx: 2, block: BOX_K3 },
    { idx: 4, block: BOX_K5 },
  ];
  for (const { idx, block } of boxes) {
    book = (await getSachbuchKontext(ID))!;
    const k = book.kapitel[idx]!;
    let t = k.manuscript.improvedText;
    t = ensureSuffix(t, block);
    if (idx === 4) {
      t = ensureSuffix(t, CTA_K5);
    }
    const ts = new Date().toISOString();
    book = await patchSachbuchKapitel(ID, k.id, {
      finalText: t,
      manuscript: {
        ...k.manuscript,
        improvedText: t,
        improvedAt: ts,
      },
      updatedAt: ts,
    });
    console.log(`Kap${idx + 1} boxes/cta patched, words`, countSachbuchWords(t));
  }

  console.log("=== Book score ===", new Date().toISOString());
  book = await scoreSachbuchBookManuscript(ID);
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
