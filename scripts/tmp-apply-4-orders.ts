/**
 * Four remaining book change-orders as surgical string edits, then re-score.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const HINT =
  "Hinweis für Buchsatz und Grafik: ";

const K1_HINT =
  "Hinweis für Buchsatz und Grafik: Die Chargeback-Rechnung der unsichtbaren Datenkosten und die Übersicht der drei Kern-KPIs gegen Daten-Überbestand sind im Druckbild als visuell abgesetzte Infokästen bzw. ausfüllbare Vorlagen zu gestalten.";

const K1_BOX = `Arbeitsvorlage Chargeback und Kern-KPIs. Tragen Sie auf einer Seite ein: Fachabteilung, Anzahl inaktiver Datensätze ohne Aufbewahrungspflicht, Ansatz pro Profil und Monat sowie die daraus folgende monatliche Umlage. Daneben die drei Kern-KPIs mit Ist-Wert: Data Health Rate (Ziel über 85 Prozent), Cost per Dormant Record (Richtwert 0,30 bis 0,60 Euro pro Monat), Unstructured Storage Decay Time (Ziel 14 bis 30 Tage).`;

const K2_HINT =
  "Hinweis für Buchsatz und Grafik: Der 6-Fragen-Prozesssteckbrief ist im Druckbild als ganzseitige, visuell abgesetzte Vorlage mit Eintragungsfeldern zum direkten Ausfüllen zu gestalten.";

const K2_BOX = `Arbeitsvorlage 6-Fragen-Prozesssteckbrief. Beantworten Sie auf einer Seite: Welchen konkreten Geschäftszweck erfüllt der Prozess? Welche Datenfelder sind dafür unverzichtbar? Wer braucht Zugriff im Tagesgeschäft? Wie lange müssen die Daten nach Abschluss des Vorgangs liegen bleiben? Woher wissen wir, dass die Einträge noch stimmen? Welche technische Sperre verhindert den nächsten Schattenexport? Felder für Prozessname, Owner und Datum bleiben frei.`;

const K3_HINT =
  "Hinweis für Buchsatz und Grafik: Der 14-Tage-Sprint-Plan ist im Druckbild als visuell abgesetzte Sprint-Tafel mit offenen Feldern für Zielmaske, Owner und Vollzugsdatum zu gestalten.";

const K3_BOX = `Arbeitsvorlage 14-Tage-Sprint. Tag 1 bis 3: Zielmaske und Pflichtfelder benennen. Tag 4 bis 7: Freitext durch Auswahlwerte ersetzen und ungenutzte Felder streichen. Tag 8 bis 12: Exporte kappen und Löschfrist setzen. Tag 13 bis 14: Owner zeichnet ab. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K4_HINT =
  "Hinweis für Buchsatz und Grafik: Das nachfolgende Sprint-Board für den 30-Tage-Altdaten-Sprint ist im Druckbild als ganzseitige, visuell abgesetzte Vier-Spalten-Matrix (Woche 1: Kritische Herde lokalisieren, Woche 2: ROT-Daten radikal tilgen, Woche 3: Backend-Schnittstellen, Dateiserver und Berechtigungen härten, Woche 4: Regelbetrieb mit Bordmitteln sichern) mit offenen Eintragungsfeldern für Zielsystem, Prozesseigentümer und Vollzugsdatum zum direkten Ausfüllen und Abzeichnen zu gestalten.";

const K4_BOX = `Arbeitsvorlage 30-Tage-Altdaten-Sprint. Woche 1: Kritische Herde lokalisieren. Woche 2: ROT-Daten radikal tilgen. Woche 3: Backend-Schnittstellen, Dateiserver und Berechtigungen härten. Woche 4: Regelbetrieb mit Bordmitteln sichern. Pro Zeile Zielsystem, Prozesseigentümer und Vollzugsdatum eintragen und abzeichnen.`;

const K5_HINT =
  "Hinweis für Buchsatz und Grafik: A3-Report, 9-KPI-Cockpit und 5-Monats-Masterplan sind im Druckbild als visuell abgesetzte Vorlagen bzw. Übersichtstafeln zu gestalten.";

const K5_KPI_REGISTER = `Das 9-KPI-Cockpit als Gesamtübersicht mit Zielwerten. Säule Kosten und Bestand aus Kapitel 1: Dark-Data-Quote unter zehn Prozent; Kosten pro 1.000 Kundendatensätze messbar fallend; Feld-Nutzungsrate einhundert Prozent. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; automatische Bereinigungsquote über achtundneunzig Prozent; Schatten-Export-Rate null. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Arbeitsvorlage A3-Report: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.`;

const DATABERG_OLD =
  "Wie wir bereits in Kapitel 1 anhand des Databerg-Reports gesehen haben, besteht der überwiegende Großteil typischer Unternehmensbestände aus redundantem, veraltetem Ballast und unkatalogisierten Schattendaten, während nur ein kleiner Bruchteil echten geschäftlichen Nutzwert besitzt.";

const DATABERG_NEW =
  "Wie wir in Kapitel 1 anhand des Databerg-Reports gesehen haben, ist der Großteil typischer Unternehmensbestände operativ nutzloser Ballast.";

const ROADMAP_ANCHOR =
  "In den Tagen einundsechzig bis neunzig überführen Sie die Steuerung in das betriebswirtschaftliche Cockpit. Ersetzen Sie mehrwöchige Textgutachten bei neuen KI-Anwendungsfällen verbindlich durch den einseitigen A3-Report und verknüpfen Sie dessen sechstes Feld direkt mit Ihren drei neuen KI-Führungskennzahlen im 9-KPI-Cockpit.";

const MITTELSTAND =
  "Mittelstands-Abkürzung: Wer kein eigenes DevOps- oder KI-Architekturteam hat, muss den Gateway-Knoten nicht selbst bauen. Viele Cloud-Anbieter und Fachsoftware-Häuser liefern Maskierung, Token-Filter und Zugriffsprotokolle als schaltbare SaaS- oder Managed-Funktion. In der Praxis reicht oft, den direkten Weg zu öffentlichen Chatbots zu sperren, eine vom Hersteller betriebene Filterstufe einzuschalten und die Wissenssuche auf wenige, ausdrücklich freigegebene Dokumentenräume zu begrenzen – dasselbe Prinzip, ohne eigene Vektordatenbank oder selbst geschriebenes Gateway.";

function mustReplace(text: string, old: string, neu: string, label: string): string {
  if (!text.includes(old)) {
    throw new Error(`${label}: Phrase nicht gefunden.`);
  }
  if (text.split(old).length - 1 !== 1) {
    throw new Error(`${label}: Phrase kommt ${text.split(old).length - 1}× vor.`);
  }
  return text.replace(old, neu);
}

async function patchKapitel(
  sachbuchId: string,
  kapitelId: string,
  text: string,
) {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("missing");
  const k = book.kapitel.find((c) => c.id === kapitelId);
  if (!k) throw new Error("kapitel missing");
  const now = new Date().toISOString();
  return patchSachbuchKapitel(sachbuchId, kapitelId, {
    finalText: text,
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
    },
    updatedAt: now,
  });
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Kap 5: Databerg + Mittelstand + KPI-Register + drop meta hint
  let t5 = book.kapitel[4]!.manuscript.improvedText;
  t5 = mustReplace(t5, DATABERG_OLD, DATABERG_NEW, "Kap5 Databerg");
  t5 = mustReplace(
    t5,
    ROADMAP_ANCHOR,
    `${ROADMAP_ANCHOR}\n\n${MITTELSTAND}`,
    "Kap5 Roadmap",
  );
  t5 = mustReplace(t5, K5_HINT, K5_KPI_REGISTER, "Kap5 Buchsatz→KPI-Register");
  if (t5.includes(HINT)) {
    throw new Error("Kap5: noch ein Buchsatz-Hinweis übrig.");
  }
  book = await patchKapitel(ID, book.kapitel[4]!.id, t5);
  console.log("Kap5 patched, words", countSachbuchWords(t5));

  book = (await getSachbuchKontext(ID))!;
  let t1 = book.kapitel[0]!.manuscript.improvedText;
  t1 = mustReplace(t1, K1_HINT, K1_BOX, "Kap1 Buchsatz");
  book = await patchKapitel(ID, book.kapitel[0]!.id, t1);
  console.log("Kap1 patched, words", countSachbuchWords(t1));

  book = (await getSachbuchKontext(ID))!;
  let t2 = book.kapitel[1]!.manuscript.improvedText;
  t2 = mustReplace(t2, K2_HINT, K2_BOX, "Kap2 Buchsatz");
  book = await patchKapitel(ID, book.kapitel[1]!.id, t2);
  console.log("Kap2 patched, words", countSachbuchWords(t2));

  book = (await getSachbuchKontext(ID))!;
  let t3 = book.kapitel[2]!.manuscript.improvedText;
  t3 = mustReplace(t3, K3_HINT, K3_BOX, "Kap3 Buchsatz");
  book = await patchKapitel(ID, book.kapitel[2]!.id, t3);
  console.log("Kap3 patched, words", countSachbuchWords(t3));

  book = (await getSachbuchKontext(ID))!;
  let t4 = book.kapitel[3]!.manuscript.improvedText;
  t4 = mustReplace(t4, K4_HINT, K4_BOX, "Kap4 Buchsatz");
  book = await patchKapitel(ID, book.kapitel[3]!.id, t4);
  console.log("Kap4 patched, words", countSachbuchWords(t4));

  book = (await getSachbuchKontext(ID))!;
  const leftover = book.kapitel
    .map((k, i) =>
      k.manuscript.improvedText.includes(HINT) ? i + 1 : null,
    )
    .filter(Boolean);
  if (leftover.length) {
    throw new Error(`Buchsatz-Hinweis noch in Kap ${leftover.join(",")}`);
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
