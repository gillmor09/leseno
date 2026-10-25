/**
 * Close the three remaining book gaps, then re-score.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const K1_OLD = `Arbeitsvorlage Chargeback und Kern-KPIs. Tragen Sie auf einer Seite ein: Fachabteilung, Anzahl inaktiver Datensätze ohne Aufbewahrungspflicht, Ansatz pro Profil und Monat sowie die daraus folgende monatliche Umlage. Daneben die drei Kern-KPIs mit Ist-Wert: Data Health Rate (Ziel über 85 Prozent), Cost per Dormant Record (Richtwert 0,30 bis 0,60 Euro pro Monat), Unstructured Storage Decay Time (Ziel 14 bis 30 Tage).`;

const K1_NEW = `Ihr Blatt für den Montagmorgen ist die Chargeback-Rechnung. Schreiben Sie Fachabteilung, Anzahl inaktiver Datensätze ohne Aufbewahrungspflicht und den Ansatz pro Profil auf eine Seite – darunter die monatliche Umlage. Daneben die drei Kern-KPIs mit Ist-Wert: Data Health Rate (Ziel über 85 Prozent), Cost per Dormant Record (0,30 bis 0,60 Euro pro Monat), Unstructured Storage Decay Time (14 bis 30 Tage). Wer dieses Blatt in der Montagsrunde hochhält, hat den unsichtbaren Kosten zum ersten Mal einen Namen gegeben.`;

const K2_OLD = `Arbeitsvorlage 6-Fragen-Prozesssteckbrief. Die sechs Felder in dieser Reihenfolge: Auftrag (legitimer Zweck), Menschen (betroffene Personengruppe), Datenminimum (zwingend erforderliche Angaben), fehlerfreier Fluss (ohne Handarbeit und Schattenkopien), Verantwortung (wer darf worauf zugreifen), automatisches Ende (technische Löschung). Felder für Prozessname, Owner und Datum bleiben frei.`;

const K2_NEW = `Ihr Blatt für den Montagmorgen ist der 6-Fragen-Prozesssteckbrief. Eine Seite, sechs Felder in dieser Reihenfolge: Auftrag, Menschen, Datenminimum, fehlerfreier Fluss, Verantwortung, automatisches Ende. Prozessname, Owner und Datum stehen oben. Wer diese Seite ausfüllt, bevor die nächste Maske in Produktion geht, stoppt Sammelwut an der Quelle.`;

const K3_OLD = `Arbeitsvorlage 14-Tage-Sprint. Tage 1 bis 3: Formular-Inventur und Streichkonzert. Tage 4 bis 6: Poka-Yoke-Quellvalidierung und Single Source of Truth. Tage 7 bis 9: Freitext-Wüsten in Auswahlmenüs umbauen. Tage 10 bis 12: Dashboard-Bau und CSV-Exporte abschalten. Tage 13 bis 14: Live-Gang und Vorher-Nachher-Messung. Felder für Zielmaske, Owner und Vollzugsdatum bleiben frei.`;

const K3_NEW = `Ihr Blatt für den Montagmorgen ist der 14-Tage-Sprint. Tage 1 bis 3: Formular-Inventur und Streichkonzert. Tage 4 bis 6: Poka-Yoke und eine Quelle der Wahrheit. Tage 7 bis 9: Freitext-Wüsten in Auswahlmenüs. Tage 10 bis 12: Dashboard-Bau, CSV-Exporte zu. Tage 13 bis 14: Live-Gang und Vorher-Nachher-Messung. Eine Maske, ein Owner, ein Datum.`;

const K4_OLD = `Arbeitsvorlage 30-Tage-Altdaten-Sprint. Woche 1: Kritische Herde lokalisieren. Woche 2: ROT-Daten radikal tilgen. Woche 3: Backend-Schnittstellen, Dateiserver und Berechtigungen härten. Woche 4: Regelbetrieb mit Bordmitteln sichern. Pro Zeile Zielsystem, Prozesseigentümer und Vollzugsdatum eintragen und abzeichnen.`;

const K4_NEW = `Ihr Blatt für den Montagmorgen ist der 30-Tage-Altdaten-Sprint. Woche 1: Herde finden. Woche 2: ROT tilgen. Woche 3: Schnittstellen, Dateiserver und Rechte härten. Woche 4: Regelbetrieb mit Bordmitteln. Pro Zeile System, Owner, Datum – und abzeichnen.`;

const K5_OLD = `Das 9-KPI-Cockpit als Gesamtübersicht mit Zielwerten. Säule Kosten und Bestand aus Kapitel 1: Data Health Rate über 85 Prozent; Cost per Dormant Record 0,30 bis 0,60 Euro pro Monat; Unstructured Storage Decay Time 14 bis 30 Tage. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; Muda-Quote in den operativen Kernsystemen fallend; Latenzzeit bei der Berechtigungsbereinigung unter 24 Stunden. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Arbeitsvorlage A3-Report: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.
Wenn Sie die Artefakte aus diesem Buch — Chargeback-Rechnung, 6-Fragen-Prozesssteckbrief, Sprint-Boards und das 9-KPI-Dashboard — als direkt nutzbare Vorlagen brauchen, finden Sie das Companion-Pack auf der Buch-Website des Autors. Dort lassen sich die Arbeitsblätter herunterladen und sofort im eigenen Team einsetzen.`;

const K5_NEW = `Ihr Blatt für den Montagmorgen ist das 9-KPI-Cockpit. Säule Kosten und Bestand aus Kapitel 1: Data Health Rate über 85 Prozent; Cost per Dormant Record 0,30 bis 0,60 Euro pro Monat; Unstructured Storage Decay Time 14 bis 30 Tage. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; Muda-Quote in den operativen Kernsystemen fallend; Latenzzeit bei der Berechtigungsbereinigung unter 24 Stunden. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Der A3-Report daneben: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.

Die Lean-Privacy-Architektur auf einen Blick. Fünf Artefakte in fünf Monaten: Chargeback-Rechnung (Kapitel 1), 6-Fragen-Prozesssteckbrief (Kapitel 2), 14-Tage-Sprint (Kapitel 3), 30-Tage-Altdaten-Sprint (Kapitel 4), A3-Report und 90-Tage-KI-Roadmap (Kapitel 5). Darüber das 9-KPI-Cockpit – drei Kennzahlen aus Kapitel 1, drei aus Kapitel 4, drei aus Kapitel 5. Wer die Artefakte in dieser Reihenfolge zündet, bekommt zuerst Diagnose und Stopp des Zuflusses, dann Aufräumen im Bestand und erst danach die Skalierung.

Die ausfüllbaren Blätter liegen unter leseno.de/lean-privacy, der QR-Code steht auf der Umschlaginnenseite.`;

const DOCUSIGN_OLD = `Wie unmittelbar sich der Verzicht auf solche Neugier bezahlt macht, zeigt die Praxis digitaler Software- und Dienstleistungsanbieter. Beim Signaturdienst DocuSign etwa verlangte das Registrierungsformular für kostenlose Testversionen ursprünglich eine ganze Batterie an Pflichtangaben über den Nutzer und dessen Arbeitgeber, die für das bloße Bereitstellen eines Testzugangs keinerlei operative Funktion erfüllten. Als das Unternehmen diesen Eingangsfilter entlang der dritten Kompassfrage bereinigte und die Pflichtfelder konsequent halbierte, verdoppelte sich die Registrierungsrate auf Anhieb. Auswertungen von Formular- und Marketingplattformen wie Formstack und HubSpot bestätigen diesen Hebel seit Jahren über tausende untersuchte Kampagnen hinweg: Bereits die Reduktion von vier Pflichtfeldern auf drei erhöht die Abschlussquote im Schnitt um fast fünfzig Prozent. Wie sich diese radikale Datenminimierung am Eingangstor technisch und psychologisch in E-Commerce- und B2B-Formularen umsetzen lässt – und warum ein einziges überflüssiges Formularfeld Konzerne zweistellige Millionenbeträge kosten kann –, werden wir im dritten Kapitel im Detail durchdeklinieren. An dieser Stelle genügt die betriebswirtschaftliche Grundregel: Solange die vertriebliche Qualifizierung über intelligente Folgeprozesse gesichert ist, beseitigt jede Beschränkung an der Eingangsfront Reibungsverluste, senkt das Haftungsrisiko und steigert den Umsatz.`;

const DOCUSIGN_NEW = `Wie unmittelbar sich der Verzicht auf solche Neugier bezahlt macht, zeigt sich an der dritten Kompassfrage – Datenminimum. Wer am Eingang nur das fragt, was der konkrete Auftrag braucht, senkt Reibung und Haftungsrisiko, bevor der erste Datensatz überhaupt gespeichert ist. Die Fälle, die Zahlen und der Umbau an der Maske gehören ins nächste Kapitel. Hier gilt die Grundregel: Solange die Qualifizierung über Folgeprozesse gesichert ist, beseitigt jede Beschränkung an der Eingangsfront Verschwendung.`;

const K3_MERK_ANCHOR =
  "was mehr als einer halben Vollzeitstelle entspricht, die über das Jahr hinweg nichts anderes tut, als digitalen Sondermüll zu produzieren.";

const K3_MERK = `${K3_MERK_ANCHOR}

Merksatz: Was ohne Zweck kopiert wird, ist keine Dokumentation – es ist bezahlte Verschwendung.`;

const K3_MERK2_ANCHOR =
  "Jedes zusätzliche Formularfeld erzeugt beim Nutzer kognitive Reibung, weckt Misstrauen über die wahren Absichten des Händlers und zwingt den zahlungswilligen Kunden zu unbezahlter Datenerfassungsarbeit.";

const K3_MERK2 = `${K3_MERK2_ANCHOR}

Merksatz: Ein Pflichtfeld, das der Prozess nicht braucht, ist keine Sorgfalt – es ist ein Abbruchgrund.`;

const K4_MERK_ANCHOR =
  "wodurch der gefürchtete Ausschuss und die manuelle Nacharbeit an der Wurzel gestoppt werden.";

const K4_MERK = `${K4_MERK_ANCHOR}

Merksatz: Saubere Daten an der Schnittstelle sind kein Extra – sie sind die einzige Ware, die die nächste Station ohne Nacharbeit verarbeiten kann.`;

const K4_MERK2_ANCHOR =
  "Aus Sicht der schlanken Prozesslehre markiert der Dateiversand per E-Mail das denkbar schlechteste Design.";

const K4_MERK2 = `${K4_MERK2_ANCHOR}

Merksatz: Eine Datei per Mail zu schicken heißt, den Prozess aufzugeben und Kopien außer Kontrolle zu lassen.`;

function mustReplace(text: string, old: string, neu: string, label: string): string {
  if (!text.includes(old)) {
    throw new Error(`${label}: nicht gefunden`);
  }
  if (text.split(old).length - 1 !== 1) {
    throw new Error(`${label}: ${text.split(old).length - 1}×`);
  }
  return text.replace(old, neu);
}

async function patch(i: number, text: string) {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[i]!;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: text,
    manuscript: { ...k.manuscript, improvedText: text, improvedAt: now },
    updatedAt: now,
  });
  console.log(`Kap${i + 1} words`, countSachbuchWords(text));
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  let t1 = book.kapitel[0]!.manuscript.improvedText;
  t1 = mustReplace(t1, K1_OLD, K1_NEW, "Kap1 Blatt");
  await patch(0, t1);

  book = (await getSachbuchKontext(ID))!;
  let t2 = book.kapitel[1]!.manuscript.improvedText;
  t2 = mustReplace(t2, DOCUSIGN_OLD, DOCUSIGN_NEW, "Kap2 DocuSign");
  t2 = mustReplace(t2, K2_OLD, K2_NEW, "Kap2 Blatt");
  await patch(1, t2);

  book = (await getSachbuchKontext(ID))!;
  let t3 = book.kapitel[2]!.manuscript.improvedText;
  t3 = mustReplace(t3, K3_MERK2_ANCHOR, K3_MERK2, "Kap3 Merksatz Formular");
  t3 = mustReplace(t3, K3_MERK_ANCHOR, K3_MERK, "Kap3 Merksatz Kopie");
  t3 = mustReplace(t3, K3_OLD, K3_NEW, "Kap3 Blatt");
  await patch(2, t3);

  book = (await getSachbuchKontext(ID))!;
  let t4 = book.kapitel[3]!.manuscript.improvedText;
  t4 = mustReplace(t4, K4_MERK_ANCHOR, K4_MERK, "Kap4 Merksatz Schnittstelle");
  t4 = mustReplace(t4, K4_MERK2_ANCHOR, K4_MERK2, "Kap4 Merksatz Mail");
  t4 = mustReplace(t4, K4_OLD, K4_NEW, "Kap4 Blatt");
  await patch(3, t4);

  book = (await getSachbuchKontext(ID))!;
  let t5 = book.kapitel[4]!.manuscript.improvedText;
  t5 = mustReplace(t5, K5_OLD, K5_NEW, "Kap5 Blatt+Architektur");
  await patch(4, t5);

  const leftover = (await getSachbuchKontext(ID))!.kapitel
    .map((k, i) =>
      k.manuscript.improvedText.includes("Arbeitsvorlage") ? i + 1 : null,
    )
    .filter(Boolean);
  if (leftover.length) {
    console.log("Hinweis: Arbeitsvorlage noch in Kap", leftover.join(","));
  }

  console.log("=== Book score ===");
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
