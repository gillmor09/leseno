/**
 * Close remaining 2 book gaps: density cues + harmonized 9-KPI cockpit.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const K5_COCKPIT_OLD = `Ihr Blatt für den Montagmorgen ist das 9-KPI-Cockpit. Säule Kosten und Bestand aus Kapitel 1: Data Health Rate über 85 Prozent; Cost per Dormant Record 0,30 bis 0,60 Euro pro Monat; Unstructured Storage Decay Time 14 bis 30 Tage. Säule Bestandsbetrieb aus Kapitel 4: Auskunfts-Durchlaufzeit unter fünfzehn Minuten; Muda-Quote in den operativen Kernsystemen fallend; Latenzzeit bei der Berechtigungsbereinigung unter 24 Stunden. Säule KI-Readiness aus Kapitel 5: Lead Time for Governance unter zehn Arbeitstage; Index Freshness Score über fünfundneunzig Prozent; Entschlackungsquote am Gateway steigend. Der A3-Report daneben: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen auf einer Seite.

Die Lean-Privacy-Architektur auf einen Blick. Fünf Artefakte in fünf Monaten: Chargeback-Rechnung (Kapitel 1), 6-Fragen-Prozesssteckbrief (Kapitel 2), 14-Tage-Sprint (Kapitel 3), 30-Tage-Altdaten-Sprint (Kapitel 4), A3-Report und 90-Tage-KI-Roadmap (Kapitel 5). Darüber das 9-KPI-Cockpit – drei Kennzahlen aus Kapitel 1, drei aus Kapitel 4, drei aus Kapitel 5. Wer die Artefakte in dieser Reihenfolge zündet, bekommt zuerst Diagnose und Stopp des Zuflusses, dann Aufräumen im Bestand und erst danach die Skalierung.

Die ausfüllbaren Blätter liegen unter leseno.de/lean-privacy, der QR-Code steht auf der Umschlaginnenseite.`;

const K5_COCKPIT_NEW = `Ihr Blatt für den Montagmorgen – als Einseiter-Kasten setzen – ist das 9-KPI-Cockpit.

Säule 1 – Kosten und Bestand (Kapitel 1, mit Frontend-Hebel aus Kapitel 3): Datenhygiene-Quote (Data Health Rate) über 85 Prozent; Kosten je Karteileiche (Cost per Dormant Record) 0,30 bis 0,60 Euro pro Monat; Verfallszeit unstrukturierter Ablagen (Unstructured Storage Decay Time) 14 bis 30 Tage. Die Formular-Abbruchquote und First-Time-Right-Rate aus dem 14-Tage-Sprint (Kapitel 3) speisen dieselbe Säule: Was an der Maske falsch oder zu viel abgefragt wird, treibt Dark Data und Kosten je Datensatz.

Säule 2 – Bestandsbetrieb (Kapitel 4): Auskunfts-Durchlaufzeit (Subject Access Lead Time) unter fünfzehn Minuten; Verschwendungsquote in Kernsystemen (Operational Muda Rate) fallend; Rechte-Bereinigungslatenz (Access Review Latency) unter 24 Stunden.

Säule 3 – KI-Readiness (Kapitel 5): Freigabe-Durchlaufzeit (Lead Time for Governance) unter zehn Arbeitstage; Frischegrad des Suchindex (Index Freshness Score) über fünfundneunzig Prozent; Entschlackungsquote am Gateway (Sanitized Prompt Ratio) steigend.

Der A3-Report daneben – als Einseiter-Kasten setzen: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen.

Die Lean-Privacy-Architektur auf einen Blick – als Schaubild setzen. Fünf Artefakte in fünf Monaten: Chargeback-Rechnung (Kapitel 1), 6-Fragen-Prozesssteckbrief (Kapitel 2), 14-Tage-Sprint (Kapitel 3), 30-Tage-Altdaten-Sprint (Kapitel 4), A3-Report und 90-Tage-KI-Roadmap (Kapitel 5). Darüber das 9-KPI-Cockpit: Säule 1 bündelt Kosten, Bestand und Frontend-Qualität; Säule 2 den Bestandsbetrieb; Säule 3 die KI-Skalierung. Wer die Artefakte in dieser Reihenfolge zündet, bekommt zuerst Diagnose und Stopp des Zuflusses, dann Aufräumen im Bestand und erst danach die Skalierung.

Die ausfüllbaren Blätter liegen unter leseno.de/lean-privacy, der QR-Code steht auf der Umschlaginnenseite.`;

function repairMerksaetze(text: string): string {
  return text.replace(
    /(Merksatz:[^.!?\n]+[.!?])\s+(?=[A-ZÄÖÜ])/g,
    "$1\n\n",
  );
}

function markMondaySheets(text: string): string {
  return text.replace(
    /Ihr Blatt für den Montagmorgen ist /g,
    "Ihr Blatt für den Montagmorgen – als Einseiter-Kasten setzen – ist ",
  );
}

function mustReplace(
  text: string,
  old: string,
  neu: string,
  label: string,
): string {
  if (!text.includes(old)) throw new Error(`${label}: nicht gefunden`);
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

  // Kap 1–4: repair + Monday-sheet cue
  for (let i = 0; i < 4; i++) {
    book = (await getSachbuchKontext(ID))!;
    let t = book.kapitel[i]!.manuscript.improvedText;
    t = repairMerksaetze(t);
    t = markMondaySheets(t);
    await patch(i, t);
  }

  // Kap 3 density Merksatz
  book = (await getSachbuchKontext(ID))!;
  let t3 = book.kapitel[2]!.manuscript.improvedText;
  const k3Safe =
    "sind in einer Freitext-Landschaft aufwendige manuelle Auswertungen nötig, bis das Problem überhaupt erkannt wird.";
  if (!t3.includes("Merksatz: Freitext ohne Kategorie")) {
    t3 = mustReplace(
      t3,
      k3Safe,
      `${k3Safe}\n\nMerksatz: Freitext ohne Kategorie ist keine Flexibilität – er ist Blindflug für Einkauf und Qualität.`,
      "Kap3 Merksatz Freitext",
    );
    await patch(2, t3);
  }

  // Kap 4 density Merksatz
  book = (await getSachbuchKontext(ID))!;
  let t4 = book.kapitel[3]!.manuscript.improvedText;
  const k4Safe =
    "verliere das Unternehmen das empirische Fundament für Nachfrageprognosen, Kohortenanalysen und das Training von Modellen der künstlichen Intelligenz.";
  if (!t4.includes("Merksatz: Angst vor Wissensverlust")) {
    t4 = mustReplace(
      t4,
      k4Safe,
      `${k4Safe}\n\nMerksatz: Angst vor Wissensverlust rechtfertigt keinen Datenfriedhof – Wissen ohne Zweckbindung ist Ballast mit Haftungsrisiko.`,
      "Kap4 Merksatz Angst",
    );
    await patch(3, t4);
  }

  // Kap 5: Merksätze + cockpit (before generic Monday mark)
  book = (await getSachbuchKontext(ID))!;
  let t5 = book.kapitel[4]!.manuscript.improvedText;
  t5 = repairMerksaetze(t5);

  const k5a =
    "Unter dem enormen Zeitdruck der täglichen Fallquoten hatte das Team längst zur Selbsthilfe gegriffen.";
  if (!t5.includes("Merksatz: Schatten-Tools")) {
    t5 = mustReplace(
      t5,
      k5a,
      `${k5a}\n\nMerksatz: Schatten-Tools entstehen nicht aus böser Absicht – sie entstehen, wenn das offizielle System Arbeit langsamer macht als die Umgehung.`,
      "Kap5 Merksatz Schatten",
    );
  }

  const k5b =
    "In seiner dritten Funktion dient das zentrale KI-Gateway schließlich als strategischer Befreiungsschlag gegen gefährliche Herstellerabhängigkeiten und als unbestechliche Messstation für den kontinuierlichen Verbesserungsprozess.";
  if (!t5.includes("Merksatz: Ein Gateway ohne Messpunkt")) {
    t5 = mustReplace(
      t5,
      k5b,
      `${k5b}\n\nMerksatz: Ein Gateway ohne Messpunkt ist nur ein neuer Flaschenhals – erst die Kennzahl macht ihn zum Steuerungshebel.`,
      "Kap5 Merksatz Gateway",
    );
  }

  t5 = mustReplace(t5, K5_COCKPIT_OLD, K5_COCKPIT_NEW, "Kap5 Cockpit");
  await patch(4, t5);

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
