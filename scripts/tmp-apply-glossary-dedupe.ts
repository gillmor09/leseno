/**
 * Close book-wide glossary/study re-intro gap.
 * Home: Kap.1 (5S, 1-10-100, Baymard, Cisco, Gartner) · Kap.2 (Poka-Yoke, Jidoka, Deming).
 * Later chapters: keep application, drop first-time explanations.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-glossary-dedupe.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { start?: string; find?: string; to: string };

function applySwaps(text: string, swaps: Swap[]): { text: string; n: number } {
  let next = text;
  let n = 0;
  for (const s of swaps) {
    if (s.find && next.includes(s.find)) {
      next = next.replace(s.find, s.to);
      n += 1;
      continue;
    }
    if (!s.start) continue;
    const idx = next.indexOf(s.start);
    if (idx < 0) continue;
    const endPara = next.indexOf("\n\n", idx);
    const end = endPara < 0 ? next.length : endPara;
    const old = next.slice(idx, end);
    if (old.length < 40) continue;
    next = next.slice(0, idx) + s.to + next.slice(end);
    n += 1;
  }
  return { text: next, n };
}

/** Unique lead-ins + compressed replacements (full `from` filled at runtime if needed). */
const BY_KAPITEL: Record<number, Swap[]> = {
  3: [
    {
      start:
        "Der eigentliche Durchbruch auf dem Weg zu einer bürokratiefreien Organisation",
      to: "Der eigentliche Durchbruch auf dem Weg zu einer bürokratiefreien Organisation gelingt erst dann, wenn die datenschutzrechtlichen Kontrollpunkte in denselben PDCA-Takt einrasten, den Kapitel 2 als Gegenstück zur Rechenschaftspflicht eingeführt hat. In vielen Betrieben existieren ausgereifte Qualitätsmanagementsysteme nach ISO 9001 oder Informationssicherheits-Frameworks nach ISO 27001 vollkommen losgelöst von der Datenschutzorganisation. Während Qualitätssicherung und Release-Management ihren Plan-Do-Check-Act-Zyklus routinemäßig durchlaufen, fristet die Rechenschaftspflicht im Datenschutz ein isoliertes Schattendasein.",
    },
    {
      find: "Branchenanalysen wie der Cisco Data Privacy Benchmark belegen regelmäßig, dass ungeklärte Datenschutz- und Sicherheitsbedenken von Firmenkunden den Verkaufsabschluss im B2B-Vertrieb im Durchschnitt um drei bis fünf Wochen verzögern.",
      to: "Der Cisco-Benchmark aus Kapitel 1 zeigt denselben Hebel an der Vertriebsnaht: ungeklärte Privacy-Fragen verzögern den B2B-Abschluss um Wochen.",
    },
    {
      find: "folgt der Übergang im operativen Qualitätsmanagement einer erprobten vierstufigen Transformationslogik, die auf dem 5S-Prinzip aufbaut. Die erste Stufe markiert die radikale Entrümpelung des bestehenden Bestands nach der 5S-Methodik.",
      to: "folgt der Übergang derselben 5S-Logik aus Kapitel 1: zuerst Entrümpeln, dann Ordnung, dann Standard. Die erste Stufe markiert die radikale Entrümpelung des bestehenden Bestands.",
    },
  ],
  4: [
    {
      start:
        "Wie teuer dieser Ballast im Frontend am direkten Kundenkontaktpunkt wird, belegen die Langzeituntersuchungen des Baymard Institute",
      to: "Wie teuer dieser Ballast im Frontend wird, haben wir mit der Baymard-Checkout-Forschung bereits in Kapitel 1 gesehen: überlange Masken und erzwungene Kontoerstellungen gehören zu den stärksten Abbruchtreibern. Hier im Motor zählt die Konsequenz: Formulare auf das operative Minimum schneiden und die Conversion dort holen, wo Datenhunger sie bisher blockiert.",
    },
    {
      start: "W. Edwards Deming prägte den Satz, dass Qualität nicht im Nachhinein",
      to: "Datenminimalismus ist deshalb kein nachträgliches Löschkonzept, sondern Fehlervermeidung an der Quelle – dasselbe Deming-Postulat und dasselbe Poka-Yoke, das Kapitel 2 im Fundament verankert hat. Wo überflüssige Eingabemasken gar nicht erst existieren, sinkt die Fehlerquote, bevor jemand sie bereinigen muss.",
    },
    {
      start:
        "Um kontinuierliche Disziplin aus der Theorie in die tägliche Praxis zu überführen, bedarf es eines praxiserprobten Ordnungsrahmens. Was im physischen Produktionsbetrieb",
      to: "Um Disziplin in die tägliche Praxis zu überführen, greift derselbe 5S-Ordnungsrahmen, den Kapitel 1 auf Speicherbegrenzung und Lebenszyklus gelegt hat. Jetzt wird er zum Motor für Schnittstellen und Data Contracts: weniger Payload, weniger Suchzeit, weniger Overfetching.",
    },
    {
      start: "Der erste Schritt, das Sortieren (Seiri), trennt methodisch zwischen Daten",
      to: "Konkret heißt das im Motor: am Ingestion-Point trennen, was den laufenden Transaktionszweck trägt, und Ballast verwerfen. Revisionsbelege gehören ins zugriffsbeschränkte Archiv, nicht in operative Transaktionstabellen. Jedes verbleibende Attribut braucht Speicherort, Zweck und Owner – 5S als Arbeitsanweisung, nicht als neue Methodenlektion.",
    },
    {
      start:
        "Tritt in diesem Strom ein fehlerhafter oder strukturfremder Datensatz auf, greift das Jidoka-Prinzip der automatischen Fehlerausschleusung",
      to: "Tritt in diesem Strom ein fehlerhafter oder strukturfremder Datensatz auf, greift dasselbe Jidoka wie in Kapitel 2: der Fehler wird im Takt sichtbar und ausgeschleust, statt den ganzen Batch zu infizieren. Das korrupte Einzelereignis wandert in eine isolierte Quarantäne-Warteschlange. Nachfolgende Pakete laufen weiter; nachgelagerte Datenbanken bleiben sauber.",
    },
    {
      start:
        "Auf der operativen Ebene manifestiert sich dieser Anspruch in klar definierten Gestaltungsrichtlinien. Anstatt Interessenten schon vor der ersten Transaktion",
      to: "Auf der operativen Ebene heißt das: Pull statt Kontozwang vor der ersten Transaktion. Jared Spools Registrierungs-Button und die Baymard-Befunde aus Kapitel 1 sagen dasselbe – hier wenden wir sie an, statt sie neu herzuleiten.",
    },
    {
      find: "Marktforscher wie Gartner beziffern die Prozesskosten für die manuelle Abarbeitung einer einzigen solchen Betroffenenanfrage auf durchschnittlich rund eintausendfünfhundert US-Dollar.",
      to: "Dieselben Gartner-Auskunftskosten aus Kapitel 1 – rund 1.400 US-Dollar pro manuell recherchiertem Vorgang – gelten hier unverändert.",
    },
    {
      find: "Demnach liegen rund achtundsechzig Prozent aller gesammelten Unternehmensdaten ungenutzt als sogenannte Dark Data auf Speichersystemen brach.",
      to: "IDC bestätigt denselben Dark-Data-Befund aus Kapitel 1: der Großteil gesammelter Unternehmensdaten liegt ungenutzt brach.",
    },
  ],
  5: [
    {
      start:
        "Um die unkontrollierte Anhäufung digitaler Altlasten dauerhaft zu stoppen, bedarf es keines neuen juristischen Regelwerks, sondern eines bewährten Steuerungsinstruments aus der industriellen Qualitätslehre: der 5S-Methode.",
      to: "Um digitale Altlasten dauerhaft zu stoppen, braucht es kein neues Regelwerk, sondern denselben 5S-Rahmen aus Kapitel 1 – jetzt als Betriebssystem für Löschen und Lifecycle, nicht als erneute Werksführung.",
    },
    {
      start:
        "Der erste Schritt, das Sortieren (Seiri), trennt im Rahmen eines initialen Kehraus das operativ Notwendige konsequent vom Überflüssigen.",
      to: "Der Kehraus trennt das operativ Notwendige vom Überflüssigen. Jeder Bestand ohne aktiven Geschäftszweck und ohne ausdrückliche Aufbewahrungspflicht wird zur Deprovisionierung markiert: verwaiste Tabellen, redundante Altexporte, ungenutzte Historienfelder.",
    },
    {
      find: "Branchenanalysen des Marktforschungsinstituts Gartner verdeutlichen das daraus resultierende Dilemma:",
      to: "Gartner, bereits in Kapitel 1 zur Kostenlage unkontrollierter Bestände herangezogen, verdeutlicht dasselbe Dilemma im KI-Betrieb:",
    },
  ],
  6: [
    {
      start:
        "Die Organisationsforscher George Labovitz und Yu Sang Chang beschrieben dieses Phänomen bereits in den frühen Neunzigerjahren mit der klassischen 1-10-100-Regel",
      to: "Dasselbe Kostenverhältnis hat Kapitel 1 mit der 1-10-100-Regel beziffert: ein Euro Prävention an der Quelle, zehn für spätere Bereinigung, hundert wenn der Fehler den Kunden erreicht. Hier im Qualitätskapitel wenden wir die Regel an, statt sie neu herzuleiten.",
    },
    {
      start:
        "Datenqualität entscheidet sich in der ersten Sekunde der Erfassung. Sobald fehlerhafte oder lückenhafte Datensätze eine Systemgrenze überwinden, vervielfachen sich die Folgekosten entlang der Prozesskette. Wer Datenschutz allein als juristische Pflichtübung begreift",
      to: "Datenqualität entscheidet sich in der ersten Sekunde der Erfassung. Sobald fehlerhafte Sätze eine Systemgrenze überwinden, vervielfachen sich die Folgekosten. Privacy Value Thinking und das Poka-Yoke aus Kapitel 2 meinen hier dasselbe: Ausschuss an der Maske verhindern, nicht hinterher reparieren. Schnittstellen werden so gebaut, dass unvollständige oder syntaktisch unmögliche Eingaben gar nicht erst durchrutschen.",
    },
    {
      start: "Die fünf Phasen der 5S-Methode lösen dieses Problem systematisch auf:",
      to: "Dieselbe 5S-Logik aus Kapitel 1 löst das Schatten-IT-Problem operativ: Altexporte finden und entfernen, Live-Ansichten im System of Record schaffen, Rohdatenexport für Standardnutzer sperren. Kein neues Methodenkapitel – Anwendung auf Excel-Friedhöfe.",
    },
    {
      find: "Branchenanalysen von Plattformen wie DataGrail zeigen, dass die manuelle Bearbeitung und Aufbereitung eines einzelnen solchen Auskunftsersuchens interne Personalkosten von weit über tausend Euro beziehungsweise über 1.500 US-Dollar pro Vorgang verschlingen kann.",
      to: "DataGrail bestätigt dieselben Auskunftskosten, die Kapitel 1 mit Gartner auf über 1.400 US-Dollar beziffert hat: ein manuell recherchierter Vorgang verschlingt leicht über tausend Euro.",
    },
    {
      find: "Weltweite Erhebungen der Cisco Consumer Privacy Surveys, die wir in diesem Buch als zentrale Referenz für die Kundenwahrnehmung heranziehen, belegen diesen Mechanismus eindrucksvoll:",
      to: "Die Cisco-Erhebungen aus Kapitel 1 belegen denselben Mechanismus auf der Kundenseite:",
    },
    {
      find: "verankern VDP-Architekturen das Lean-Prinzip Jidoka – die intelligente Automation mit eingebautem Qualitätsstopp:",
      to: "verankern VDP-Architekturen dasselbe Jidoka aus Kapitel 2 – Automation mit Qualitätsstopp:",
    },
    {
      find: "Das Managementsystem Value-Driven Privacy übersetzt dieses Mindset mit einem bewährten Ordnungswerkzeug des Lean-Motors in die Praxis: der 5S-Methode, konsequent übertragen auf digitale Informationsflüsse.",
      to: "Value-Driven Privacy übersetzt dieses Mindset mit derselben 5S-Methode aus Kapitel 1, jetzt auf digitale Informationsflüsse.",
    },
  ],
  7: [
    {
      start:
        "Doch die tatsächliche betriebswirtschaftliche Gefahr unklarer Texte liegt nicht allein in dieser Wechselbereitschaft. Noch unmittelbarer schlägt sich das Misstrauen",
      to: "Noch unmittelbarer schlägt sich das Misstrauen in Prozessmüll nieder: zögerliches Onboarding, vorsorgliche Widerrufe, Abbrüche. Die Baymard-Befunde aus Kapitel 1 gelten unverändert – unverständliche Pflichtfelder und undurchsichtige Datenabfragen treiben die Quote. Hier übersetzen wir sie in Information Design, nicht in eine neue Studienlektion.",
    },
    {
      start:
        "Der wirtschaftliche Schaden unverständlicher Texte endet jedoch nicht beim verlorenen Umsatz im Onboarding.",
      to: "Der Schaden endet nicht beim verlorenen Onboarding-Umsatz. Wer Kunden mit Textbergen überfordert, zahlt später nach derselben 1-10-100-Logik aus Kapitel 1: Klarheit an der Quelle ist billig, Support und Widerruf sind teuer.",
    },
    {
      start:
        "In der industriellen Fertigung nutzt das Lean Management das Prinzip Poka-Yoke, was übersetzt so viel bedeutet",
      to: "Dasselbe Poka-Yoke aus Kapitel 2 gilt an der Schnittstelle zwischen Backend und Kundenkommunikation: Die Datenhaltung ist die Wahrheit; das Frontend darf nichts versprechen, was die Architektur nicht hält. Weicht das reale Datenpaket von der Funktionsbeschreibung ab, verweigert das Quality Gate die Freigabe.",
    },
    {
      find: "Da die manuelle Bearbeitung eines einzigen solchen Auskunftsersuchens laut Berechnungen von Gartner im Schnitt Prozesskosten von über 1.400 US-Dollar verursacht",
      to: "Da die manuelle Bearbeitung eines einzigen solchen Auskunftsersuchens laut den Gartner-Zahlen aus Kapitel 1 im Schnitt über 1.400 US-Dollar verursacht",
    },
    {
      find: "Angesichts der von Gartner bezifferten internen Bearbeitungskosten von durchschnittlich über 1.400 US-Dollar für ein einziges manuell recherchiertes Auskunftsersuchen",
      to: "Angesichts derselben Gartner-Auskunftskosten aus Kapitel 1",
    },
    {
      find: "Wie die Branchenstudien der Cisco Consumer Privacy Surveys eindrucksvoll belegen,",
      to: "Wie die Cisco-Studien aus Kapitel 1 belegen,",
    },
  ],
  8: [
    {
      start:
        "Bei den Betriebskosten rächt sich diese Trägheit sofort nach der bekannten 1-10-100-Regel der Datenqualität und des Qualitätsmanagements:",
      to: "Bei den Betriebskosten rächt sich diese Trägheit nach derselben 1-10-100-Regel aus Kapitel 1: Statusänderung an der Quelle ist billig; nachträgliche Synchronisation ist teuer; die unerwünschte Nachricht beim Kunden ist am teuersten.",
    },
    {
      find: "Wie die internationalen Erhebungen der Cisco Data Privacy Benchmark Study 2024 belegen,",
      to: "Wie der Cisco-Benchmark aus Kapitel 1 für 2024 bekräftigt,",
    },
    {
      find: "Laut dem Cisco Consumer Privacy Survey haben bereits 67 Prozent der Verbraucher weltweit Datenschutzeinstellungen in Kundenkonten oder mobilen Anwendungen bewusst eingeschränkt",
      to: "Laut denselben Cisco-Consumer-Zahlen aus Kapitel 1 haben bereits 67 Prozent der Verbraucher Datenschutzeinstellungen bewusst eingeschränkt",
    },
  ],
  9: [
    {
      start:
        "Wer diesen Systemansatz bis zum Ende durchdenkt, erkennt die fundamentale Parallele zur Geschichte des modernen Qualitätsmanagements. Als Pioniere wie W. Edwards Deming",
      to: "Wer den Systemansatz zu Ende denkt, trifft wieder auf Deming und das Toyota-System aus Kapitel 2: Qualität wird nicht am Ende hineingeprüft. Daten sind Rohmaterial digitaler Wertströme – KI vervielfacht denselben Konstruktionsfehler, wenn das Fundament fehlt.",
    },
    {
      find: "Hier greift die aus Kapitel 6 bekannte 1-10-100-Regel der Qualitätssicherung in voller Schärfe:",
      to: "Hier greift die 1-10-100-Regel aus Kapitel 1 in voller Schärfe:",
    },
    {
      find: "Die Data and Privacy Benchmark Study von Cisco unterstreicht diesen Befund eindrucksvoll:",
      to: "Der Cisco-Benchmark aus Kapitel 1 unterstreicht denselben Befund für KI:",
    },
    {
      find: "Die Zahlen der Cisco Data Privacy Benchmark Study 2024 belegen diesen massiven Verlust an Vertriebsgeschwindigkeit und die enorme Hebelwirkung einer reifen Architektur:",
      to: "Die Cisco-Zahlen aus Kapitel 1 belegen denselben Verlust an Vertriebsgeschwindigkeit und die Hebelwirkung einer reifen Architektur:",
    },
    {
      find: "Dass KI-Initiativen in der Wirtschaft vor allem an diesem handwerklichen Fundament scheitern, belegen aktuelle Marktdaten von Gartner:",
      to: "Dass KI-Initiativen vor allem am handwerklichen Fundament scheitern, belegen dieselben Gartner-Marktdaten, die Kapitel 1 und 5 bereits zur Dark-Data- und KI-Lage herangezogen haben:",
    },
  ],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const results: Array<{
    kap: number;
    title: string;
    swaps: number;
    wordsBefore: number;
    wordsAfter: number;
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const swaps = BY_KAPITEL[i + 1];
    if (!swaps?.length) continue;
    const before = sachbuchKapitelBodyText(k);
    const { text: after, n } = applySwaps(before, swaps);
    if (n === 0) {
      results.push({
        kap: i + 1,
        title: k.title,
        swaps: 0,
        wordsBefore: countSachbuchWords(before),
        wordsAfter: countSachbuchWords(before),
      });
      continue;
    }
    const now = new Date().toISOString();
    const hasImproved = Boolean(k.manuscript.improvedText.trim());
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: after,
        draftText: hasImproved ? k.manuscript.draftText : before,
        improvedAt: now,
      },
      finalText: after,
      updatedAt: now,
    });
    results.push({
      kap: i + 1,
      title: k.title,
      swaps: n,
      wordsBefore: countSachbuchWords(before),
      wordsAfter: countSachbuchWords(after),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
