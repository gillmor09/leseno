/**
 * Replace wooden meta cross-refs (dedupe-prompt artifacts) with natural prose.
 * Kap 5–9; keep substance, drop editorial stage directions.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-natural-xrefs.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  5: [
    {
      find: "Analysen von Gartner, die wir bereits in Kapitel 1 zur Kostenlage unkontrollierter Bestände herangezogen haben, verdeutlichen dasselbe Dilemma im KI-Betrieb:",
      to: "Gartner-Analysen zur Kostenlage unkontrollierter Bestände zeigen dasselbe Dilemma im KI-Betrieb:",
    },
    {
      find: "Um digitale Altlasten dauerhaft zu stoppen, braucht es kein neues Regelwerk, sondern denselben 5S-Rahmen aus Kapitel 1 – jetzt übersetzt in das operative VDP-Betriebssystem für Löschen und Lifecycle.",
      to: "Um digitale Altlasten dauerhaft zu stoppen, braucht es kein neues Regelwerk, sondern den 5S-Rahmen als operatives VDP-Betriebssystem für Löschen und Lifecycle.",
    },
  ],
  6: [
    {
      find: "Gartner, bereits in Kapitel 1 zur Dark-Data-Lage herangezogen, beziffert die jährlichen Verluste durch mangelhafte Datenqualität auf durchschnittlich 12,9 Millionen US-Dollar pro Jahr und Unternehmen.",
      to: "Gartner beziffert die jährlichen Verluste durch mangelhafte Datenqualität auf durchschnittlich 12,9 Millionen US-Dollar pro Jahr und Unternehmen.",
    },
    {
      find: "Dasselbe Kostenverhältnis hat Kapitel 1 mit der 1-10-100-Regel beziffert: 1 Euro Prävention an der Quelle, 10 Euro für spätere Bereinigung, 100 Euro, wenn der Fehler den Kunden erreicht. Hier im Qualitätskapitel wenden wir die Regel an, statt sie neu herzuleiten.",
      to: "Nach der 1-10-100-Regel kostet Prävention an der Quelle einen Euro, spätere Bereinigung zehn und der Fehler beim Kunden hundert. Genau dieses Verhältnis treibt die Qualitätskosten in der Praxis.",
    },
    {
      find: "DataGrail bestätigt dieselben Auskunftskosten, die Kapitel 1 mit Gartner auf über 1.400 US-Dollar beziffert hat – ein manuell recherchierter Vorgang verschlingt leicht über 1.000 Euro.",
      to: "Branchenanalysen von DataGrail und Gartner zeigen denselben Größenorden: Ein manuell recherchierter Vorgang verschlingt leicht über 1.000 Euro, oft über 1.400 US-Dollar.",
    },
    {
      find: "Unser Qualitätsansatz und das Poka-Yoke-Prinzip aus Kapitel 2 meinen hier dasselbe: Ausschuss an der Maske verhindern, nicht hinterher reparieren.",
      to: "Privacy Value Thinking und Poka-Yoke zielen hier auf denselben Hebel: Ausschuss an der Maske verhindern, nicht hinterher reparieren.",
    },
    {
      find: "Was die Usability-Forschung seit den frühen Arbeiten von Luke Wroblewski belegt und aktuelle Checkout-Analysen des Baymard Institutes bestätigen – die wir in diesem Buch bereits als zentrale Referenz für nutzerzentrierte Formulargestaltung herangezogen haben –, gilt unverändert:",
      to: "Was die Usability-Forschung seit den frühen Arbeiten von Luke Wroblewski belegt und aktuelle Checkout-Analysen des Baymard Institutes bestätigen, gilt unverändert:",
    },
    {
      find: "Hier greift die 1-10-100-Regel aus Kapitel 1 unmittelbar:",
      to: "Hier greift die 1-10-100-Regel unmittelbar:",
    },
    {
      find: "verankern moderne Architekturen dasselbe Jidoka aus Kapitel 2 – Automation mit Qualitätsstopp:",
      to: "verankern moderne Architekturen Jidoka – Automation mit Qualitätsstopp:",
    },
    {
      find: "Unsere Praxismethodik übersetzt dieses Mindset mit derselben 5S-Methode aus Kapitel 1, jetzt auf digitale Informationsflüsse.",
      to: "Unsere Praxismethodik übersetzt dieses Mindset mit der 5S-Methode auf digitale Informationsflüsse.",
    },
    {
      find: "Dieselbe 5S-Logik aus Kapitel 1 löst das Schatten-IT-Problem operativ: Altexporte finden und entfernen, Live-Ansichten im System of Record schaffen, Rohdatenexport für Standardnutzer sperren. Kein neues Methodenkapitel – Anwendung auf Excel-Friedhöfe.",
      to: "Mit 5S lösen Teams das Schatten-IT-Problem operativ: Altexporte finden und entfernen, Live-Ansichten im System of Record schaffen, Rohdatenexport für Standardnutzer sperren – und so Excel-Friedhöfe auflösen.",
    },
    {
      find: "Die Cisco-Erhebungen aus Kapitel 1 belegen denselben Mechanismus auf der Kundenseite:",
      to: "Cisco-Erhebungen belegen denselben Mechanismus auf der Kundenseite:",
    },
    {
      find: "Die ökonomische Rechnung nach der 1-10-100-Regel aus Kapitel 1 spricht für sich selbst.",
      to: "Die ökonomische Rechnung nach der 1-10-100-Regel spricht für sich selbst.",
    },
  ],
  7: [
    {
      find: "Wie die Cisco-Studien aus Kapitel 1 belegen,",
      to: "Wie Cisco-Studien belegen,",
    },
    {
      find: "Die Baymard-Befunde aus Kapitel 1 gelten hier unverändert, wonach unverständliche Pflichtfelder und undurchsichtige Datenabfragen die Abbruchquote nach oben treiben. An dieser Stelle übersetzen wir diese Erkenntnisse konsequent in handwerkliches Information Design. Denn der wirtschaftliche Schaden endet nicht beim verlorenen Onboarding-Umsatz. Wer Kunden mit Textbergen überfordert, zahlt später nach derselben 1-10-100-Logik aus Kapitel 1 drauf: Klarheit an der Quelle ist billig, nachträglicher Support und Widerruf sind teuer.",
      to: "Unverständliche Pflichtfelder und undurchsichtige Datenabfragen treiben die Abbruchquote nach oben – ein Befund, den die Checkout-Forschung des Baymard Institute seit Jahren dokumentiert. An dieser Stelle entscheidet handwerkliches Information Design. Denn der wirtschaftliche Schaden endet nicht beim verlorenen Onboarding-Umsatz. Wer Kunden mit Textbergen überfordert, zahlt später nach der 1-10-100-Logik drauf: Klarheit an der Quelle ist billig, nachträglicher Support und Widerruf sind teuer.",
    },
    {
      find: "laut den Gartner-Zahlen aus Kapitel 1 im Schnitt über 1.400 US-Dollar verursacht",
      to: "laut Gartner im Schnitt über 1.400 US-Dollar verursacht",
    },
    {
      find: "Dasselbe Poka-Yoke-Prinzip aus Kapitel 2 – bei dem eine abgeschrägte Ecke wie bei einer SIM-Karte das falsche Einlegen physisch unmöglich macht – gilt an der Schnittstelle zwischen Backend und Kundenkommunikation: Die Datenhaltung ist die Wahrheit; das Frontend darf nichts versprechen, was die Architektur nicht hält. Weicht das reale Datenpaket von der Funktionsbeschreibung ab, verweigert das Quality Gate die Freigabe.",
      to: "An der Schnittstelle zwischen Backend und Kundenkommunikation gilt dasselbe Poka-Yoke wie an einer SIM-Karte mit abgeschrägter Ecke: Die Datenhaltung ist die Wahrheit; das Frontend darf nichts versprechen, was die Architektur nicht hält. Weicht das reale Datenpaket von der Funktionsbeschreibung ab, verweigert das Quality Gate die Freigabe.",
    },
  ],
  8: [
    {
      find: "Wie die Cisco-ROI-Rechnung aus Kapitel 1 verdeutlicht,",
      to: "Wirtschaftlichkeitsberechnungen von Cisco verdeutlichen,",
    },
    {
      find: "Bei den Betriebskosten rächt sich diese Trägheit nach derselben 1-10-100-Regel aus Kapitel 1: Statusänderung an der Quelle ist billig; nachträgliche Synchronisation ist teuer; die unerwünschte Nachricht beim Kunden ist am teuersten.",
      to: "Bei den Betriebskosten rächt sich diese Trägheit nach der 1-10-100-Regel: Statusänderung an der Quelle ist billig; nachträgliche Synchronisation ist teuer; die unerwünschte Nachricht beim Kunden ist am teuersten.",
    },
    {
      find: "Laut denselben Cisco-Consumer-Zahlen aus Kapitel 1 haben bereits 67 Prozent der Verbraucher Datenschutzeinstellungen bewusst eingeschränkt,",
      to: "Laut dem Cisco Consumer Privacy Survey haben bereits 67 Prozent der Verbraucher Datenschutzeinstellungen bewusst eingeschränkt,",
    },
    {
      find: "Wie der Cisco-Benchmark aus Kapitel 1 für 2024 bekräftigt,",
      to: "Wie die Cisco Data Privacy Benchmark Study 2024 zeigt,",
    },
  ],
  9: [
    {
      find: "Wer den Systemansatz zu Ende denkt, trifft wieder auf Deming und das Toyota-System aus Kapitel 2: Qualität wird nicht am Ende hineingeprüft. Daten sind Rohmaterial digitaler Wertströme – KI vervielfacht denselben Konstruktionsfehler, wenn das Fundament fehlt.",
      to: "Wer den Systemansatz zu Ende denkt, landet wieder bei Deming und dem Toyota-Produktionssystem: Qualität wird nicht am Ende hineingeprüft. Daten sind Rohmaterial digitaler Wertströme – KI vervielfacht denselben Konstruktionsfehler, wenn das Fundament fehlt.",
    },
    {
      find: "Dass KI-Initiativen vor allem am handwerklichen Fundament scheitern, belegen dieselben Gartner-Marktdaten, die Kapitel 1 und 5 bereits zur Dark-Data- und KI-Lage herangezogen haben:",
      to: "Dass KI-Initiativen vor allem am handwerklichen Fundament scheitern, belegen aktuelle Gartner-Marktdaten:",
    },
    {
      find: "Der Cisco-Benchmark aus Kapitel 1 unterstreicht denselben Befund für KI:",
      to: "Der Cisco Data Privacy Benchmark unterstreicht denselben Befund für KI:",
    },
    {
      find: "Die Cisco-Zahlen aus Kapitel 1 belegen denselben Verlust an Vertriebsgeschwindigkeit und die Hebelwirkung einer reifen Architektur:",
      to: "Cisco-Zahlen belegen denselben Verlust an Vertriebsgeschwindigkeit und die Hebelwirkung einer reifen Architektur:",
    },
    {
      find: "dockt ab Monat 2 der detaillierte 90-Tage-Lösch-Sprint aus Kapitel 5 nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an.",
      to: "dockt ab Monat 2 der detaillierte 90-Tage-Lösch-Sprint nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an.",
    },
    {
      find: "Parallel dazu klinkt sich in dieser Phase der aus Kapitel 5 bekannte 90-Tage-Lösch-Sprint als spezialisierter technischer Arbeitsstrang ein:",
      to: "Parallel dazu klinkt sich in dieser Phase der 90-Tage-Lösch-Sprint als spezialisierter technischer Arbeitsstrang ein:",
    },
    {
      find: "Hier greift die 1-10-100-Regel aus Kapitel 1 in voller Schärfe:",
      to: "Hier greift die 1-10-100-Regel in voller Schärfe:",
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
    missed: string[];
    wordsBefore: number;
    wordsAfter: number;
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const swaps = BY_KAPITEL[i + 1];
    if (!swaps?.length) continue;
    let body = sachbuchKapitelBodyText(k);
    const before = body;
    const missed: string[] = [];
    let n = 0;
    for (const s of swaps) {
      if (!body.includes(s.find)) {
        missed.push(s.find.slice(0, 80));
        continue;
      }
      body = body.replace(s.find, s.to);
      n += 1;
    }
    if (n > 0) {
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: {
          ...k.manuscript,
          improvedText: body,
          improvedAt: now,
        },
        finalText: body,
        updatedAt: now,
      });
    }
    results.push({
      kap: i + 1,
      title: k.title,
      swaps: n,
      missed,
      wordsBefore: countSachbuchWords(before),
      wordsAfter: countSachbuchWords(body),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
