/**
 * Align Arbeitsvorlagen + 9-KPI names with chapter definitions (follow-on nits).
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const K2_OLD = `Arbeitsvorlage 6-Fragen-Prozesssteckbrief. Beantworten Sie auf einer Seite: Welchen konkreten Geschäftszweck erfüllt der Prozess? Welche Datenfelder sind dafür unverzichtbar? Wer braucht Zugriff im Tagesgeschäft? Wie lange müssen die Daten nach Abschluss des Vorgangs liegen bleiben? Woher wissen wir, dass die Einträge noch stimmen? Welche technische Sperre verhindert den nächsten Schattenexport? Felder für Prozessname, Owner und Datum bleiben frei.`;

const K2_NEW = `Arbeitsvorlage 6-Fragen-Prozesssteckbrief. Die sechs Felder in dieser Reihenfolge: Auftrag (legitimer Zweck), Menschen (betroffene Personengruppe), Datenminimum (zwingend erforderliche Angaben), fehlerfreier Fluss (ohne Handarbeit und Schattenkopien), Verantwortung (wer darf worauf zugreifen), automatisches Ende (technische Löschung). Felder für Prozessname, Owner und Datum bleiben frei.`;

const K3_OLD = `Arbeitsvorlage 14-Tage-Sprint. Tag 1 bis 3: Zielmaske und Pflichtfelder benennen. Tag 4 bis 7: Freitext durch Auswahlwerte ersetzen und ungenutzte Felder streichen. Tag 8 bis 12: Exporte kappen und Löschfrist setzen. Tag 13 bis 14: Owner zeichnet ab. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K3_NEW = `Arbeitsvorlage 14-Tage-Sprint. Tage 1 bis 3: Zielmaske und Pflichtfelder benennen. Tage 4 bis 6: Freitext durch Auswahlwerte ersetzen. Tage 7 bis 9: ungenutzte Felder streichen. Tage 10 bis 12: Exporte kappen und Löschfrist setzen. Tage 13 bis 14: Owner zeichnet ab. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K5_OLD = `Das 9-KPI-Cockpit als Gesamtübersicht mit Zielwerten. Säule Kosten und Bestand aus Kapitel 1: Dark-Data-Quote unter zehn Prozent; Kosten pro 1.000 Kundendatensätze messbar fallend; Feld-Nutzungsrate einhundert Prozent. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; automatische Bereinigungsquote über achtundneunzig Prozent; Schatten-Export-Rate null. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Arbeitsvorlage A3-Report: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.`;

const K5_NEW = `Das 9-KPI-Cockpit als Gesamtübersicht mit Zielwerten. Säule Kosten und Bestand aus Kapitel 1: Data Health Rate über 85 Prozent; Cost per Dormant Record 0,30 bis 0,60 Euro pro Monat; Unstructured Storage Decay Time 14 bis 30 Tage. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; Muda-Quote in den operativen Kernsystemen fallend; Latenzzeit bei der Berechtigungsbereinigung unter neunzig Tagen. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Arbeitsvorlage A3-Report: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.`;

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
  await patch(1, K2_OLD, K2_NEW, "Kap2 Vorlage");
  await patch(2, K3_OLD, K3_NEW, "Kap3 Vorlage");
  await patch(4, K5_OLD, K5_NEW, "Kap5 KPI-Namen");
  console.log("=== Book score ===");
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
