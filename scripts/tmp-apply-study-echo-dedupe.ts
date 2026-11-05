/**
 * Kill study/stat echoes after home chapters.
 * Home: Kap.1 (Baymard, Gartner-1400, Dark Data, Cisco-Grundlage) · Kap.2 (Cisco-ROI).
 * Kap.5 keeps KI-Pilot-Scheitern once; Kap.6 keeps 12,9-Mio / Migrations-Stats (unique).
 * Later: keep local argument, drop brand+number reprise.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-study-echo-dedupe.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  3: [
    {
      find: "Wie die bereits beleuchteten Benchmarks von Cisco zeigen, verzögern ungeklärte Datenschutzfragen den B2B-Abschluss regelmäßig um Wochen.",
      to: "Ungeklärte Datenschutzfragen verzögern den B2B-Abschluss regelmäßig um Wochen.",
    },
  ],
  4: [
    {
      find: "Wie teuer dieser Ballast im Frontend wird, belegt die Checkout-Forschung des Baymard-Instituts: Überlange Eingabemasken und erzwungene Kontoerstellungen gehören zu den stärksten Abbruchtreibern im digitalen Geschäft.",
      to: "Wie teuer dieser Ballast im Frontend wird, zeigt sich an überlangen Eingabemasken und erzwungenen Kontoerstellungen: Sie gehören zu den stärksten Abbruchtreibern im digitalen Geschäft.",
    },
    {
      find: "Wie akut dieser Müllberg ist, belegen Untersuchungen der Marktforscher von IDC zum Phänomen der Dark Data: Der weit überwiegende Großteil aller gesammelten Unternehmensdaten liegt ungenutzt brach.",
      to: "Wie akut dieser Müllberg ist, zeigt sich daran, dass der weit überwiegende Großteil aller gesammelten Unternehmensdaten ungenutzt brachliegt.",
    },
    {
      find: "Nach Erhebungen von Gartner verursacht ein einziger manuell recherchierter Auskunftsvorgang im Schnitt rund 1.400 US-Dollar an internen Prozesskosten.",
      to: "Ein einziger manuell recherchierter Auskunftsvorgang verschlingt leicht vierstellige Beträge an internen Prozesskosten.",
    },
  ],
  5: [
    {
      find: "Gartner-Analysen zur Kostenlage unkontrollierter Bestände zeigen dasselbe Dilemma im KI-Betrieb: Bis zu einem Drittel aller Unternehmensinitiativen für generative künstliche Intelligenz scheitert bereits nach der Pilotphase an mangelhafter Datenqualität, unklaren Zugriffskontrollen und explodierenden Betriebskosten.",
      to: "Dasselbe Dilemma trifft den KI-Betrieb: Ein großer Teil generativer Initiativen scheitert bereits nach der Pilotphase an mangelhafter Datenqualität, unklaren Zugriffskontrollen und explodierenden Betriebskosten.",
    },
    {
      find: "Einschlägige Branchenanalysen zeigen, dass die rein händische Bearbeitung eines solchen Betroffenenersuchens im Schnitt rund 14 Tage dauert und Unternehmen durch gebundene Personalressourcen im Mittel über 1.500 US-Dollar pro Einzelfall kostet.",
      to: "Die rein händische Bearbeitung eines solchen Betroffenenersuchens zieht sich oft über zwei Wochen und verschlingt leicht vierstellige Beträge an gebundenen Personalressourcen.",
    },
  ],
  6: [
    {
      find: "Branchenanalysen von DataGrail und Gartner zeigen denselben Größenorden: Ein manuell recherchierter Vorgang verschlingt leicht über 1.000 Euro, oft über 1.400 US-Dollar.",
      to: "Komplexe manuelle Vorgänge erreichen leicht den vierstelligen Euro-Bereich – und das pro Einzelfall.",
    },
    {
      find: "Was die Usability-Forschung seit den frühen Arbeiten von Luke Wroblewski belegt und aktuelle Checkout-Analysen des Baymard Institutes bestätigen, gilt unverändert:",
      to: "Was die Usability-Forschung seit den frühen Arbeiten von Luke Wroblewski belegt und aktuelle Checkout-Analysen bestätigen, gilt unverändert:",
    },
    {
      find: "Cisco-Erhebungen belegen denselben Mechanismus auf der Kundenseite: Für 39 Prozent der Konsumenten ist aktive Datentransparenz der wichtigste Einzelfaktor, um Vertrauen zu einem Unternehmen aufzubauen, und 81 Prozent der Befragten setzen die Art und Weise, wie ein Unternehmen mit ihren persönlichen Daten umgeht, direkt damit gleich, wie sehr das Unternehmen sie als Kunden respektiert und wertschätzt.",
      to: "Auf der Kundenseite wirkt derselbe Mechanismus: Aktive Datentransparenz ist für viele Konsumenten der wichtigste Einzelfaktor für Vertrauen, und der Umgang mit persönlichen Daten gilt als direkter Maßstab dafür, wie sehr ein Unternehmen sie als Kunden respektiert.",
    },
  ],
  7: [
    {
      find: "Wie Cisco-Studien belegen, setzen 81 Prozent der Verbraucher den Umgang eines Anbieters mit ihren persönlichen Daten direkt mit der allgemeinen Wertschätzung und dem Respekt gegenüber ihrer Person gleich. Zwischen 75 und 76 Prozent der Befragten geben an, bei Misstrauen oder Zweifeln an der Aufrichtigkeit der Datenpraxis gar nicht erst zu kaufen, und 37 Prozent aller Verbraucher – unter den jüngeren Erwachsenen sogar fast die Hälfte – haben wegen intransparenter Datenpraktiken bereits aktiv den Dienstleister gewechselt.",
      to: "Für die meisten Verbraucher ist der Umgang mit ihren Daten ein direktes Maß für Respekt und Wertschätzung. Bei Misstrauen kaufen viele gar nicht erst – und ein spürbarer Teil wechselt wegen intransparenter Datenpraktiken aktiv den Dienstleister.",
    },
    {
      find: "Unverständliche Pflichtfelder und undurchsichtige Datenabfragen treiben die Abbruchquote nach oben – ein Befund, den die Checkout-Forschung des Baymard Institute seit Jahren dokumentiert.",
      to: "Unverständliche Pflichtfelder und undurchsichtige Datenabfragen treiben die Abbruchquote nach oben.",
    },
    {
      find: "Da die manuelle Bearbeitung eines einzigen solchen Auskunftsersuchens laut Gartner im Schnitt über 1.400 US-Dollar verursacht – primär getrieben durch aufwendige, manuell recherchierte Suchläufe in verteilten Systemen –, wird jede unklare Klausel im Frontend zu einer tickenden Kostenbombe für den laufenden Betrieb.",
      to: "Da die manuelle Bearbeitung eines einzigen solchen Auskunftsersuchens – getrieben durch Suchläufe in verteilten Systemen – leicht vierstellige Beträge verschlingt, wird jede unklare Klausel im Frontend zu einer tickenden Kostenbombe für den laufenden Betrieb.",
    },
  ],
  8: [
    {
      find: "Wie globale Marktstudien aus dem Cisco Consumer Privacy Survey zeigen, betonen 75 Prozent der Konsumenten, dass sie nicht bei Unternehmen kaufen, deren Datenpraktiken sie misstrauen. Im digitalen Alltag klicken dieselben Personen dennoch resigniert auf „Zustimmen“, schlicht um den Kaufprozess endlich abzuschließen oder den gewünschten Artikel lesen zu können. Doch dieser vermeintliche Triumph des Growth-Teams rächt sich unweigerlich. Fast 50 Prozent der jüngeren Kunden unter 30 Jahren brechen laut derselben Erhebung die Geschäftsbeziehung dauerhaft ab und wechseln den Dienstleister, sobald unredliche Datenpraktiken im laufenden Betrieb sichtbar werden.",
      to: "Viele Konsumenten betonen, dass sie nicht bei Unternehmen kaufen, deren Datenpraktiken sie misstrauen. Im digitalen Alltag klicken dieselben Personen dennoch resigniert auf „Zustimmen“, schlicht um den Kaufprozess endlich abzuschließen oder den gewünschten Dienst nutzen zu können. Doch dieser vermeintliche Triumph des Growth-Teams rächt sich: Sobald unredliche Datenpraktiken im laufenden Betrieb sichtbar werden, brechen vor allem jüngere Kunden die Geschäftsbeziehung dauerhaft ab.",
    },
    {
      find: "Ehrliche Datenprozesse rechnen sich über den gesamten Lebenszyklus hinweg. Wirtschaftlichkeitsberechnungen von Cisco verdeutlichen, erzielen Organisationen, die strategisch in transparente, vertrauenswürdige Datenschutzstrukturen investieren, einen messbaren betriebswirtschaftlichen Ertrag vom 1,6- bis 2-Fachen ihrer Aufwendungen – im Durchschnitt erzeugt jeder investierte Euro einen Gegenwert von 1,60 Euro. Symmetrische Interfaces schützen vor Datenmüll, sichern die In-Line-Qualität direkt im laufenden Datenfluss und wandeln erzwungene Klicks in verlässliches Kundenkapital.",
      to: "Ehrliche Datenprozesse rechnen sich über den gesamten Lebenszyklus hinweg: Wer strategisch in transparente, vertrauenswürdige Strukturen investiert, erntet den Mehrwert nicht als Compliance-Trophäe, sondern als kürzere Zyklen und belastbareres Kundenkapital. Symmetrische Interfaces schützen vor Datenmüll, sichern die In-Line-Qualität direkt im laufenden Datenfluss und wandeln erzwungene Klicks in verlässliche Beziehungen.",
    },
    {
      find: "Das schützt die Konversionsrate des eigentlichen Verkaufsprozesses vor kostspieligen Kaufabbrüchen, wie sie in der bekannten Checkout-Forschung des Baymard Institute und zahlreichen UX-Studien immer wieder als Folge überladener und übergriffiger Formulare dokumentiert werden.",
      to: "Das schützt die Konversionsrate des eigentlichen Verkaufsprozesses vor kostspieligen Kaufabbrüchen durch überladene und übergriffige Formulare.",
    },
    {
      find: "Laut dem Cisco Consumer Privacy Survey haben bereits 67 Prozent der Verbraucher Datenschutzeinstellungen bewusst eingeschränkt, weil ihnen die Praktiken der Anbieter fragwürdig erschienen.",
      to: "Immer mehr Verbraucher schränken Datenschutzeinstellungen bewusst ein, weil ihnen die Praktiken der Anbieter fragwürdig erscheinen.",
    },
    {
      find: "Wie die Cisco Data Privacy Benchmark Study 2024 zeigt, bestätigen über 75 Prozent der befragten Unternehmen, dass klare, reife Datenschutzprozesse operative Verzögerungen im Vertrieb abbauen und die Kundenloyalität messbar stärken; während Anbieter mit unzureichend dokumentierten Prozessen durch kritische Kundenrückfragen im Schnitt über fünf Wochen im B2B-Verkaufszyklus verlieren, kappen datenschutzreife Organisationen diesen Verzug um mehrere Wochen.",
      to: "Reife Datenschutzprozesse bauen operative Verzögerungen im Vertrieb ab und stärken die Kundenloyalität; wo Dokumentation fehlt, verlieren Anbieter durch kritische Kundenrückfragen oft mehrere Wochen im B2B-Verkaufszyklus.",
    },
  ],
  9: [
    {
      find: "Dass KI-Initiativen vor allem am handwerklichen Fundament scheitern, belegen aktuelle Gartner-Marktdaten: Die Analysten prognostizieren bis zum Jahr 2026 den vorzeitigen Abbruch von über 60 Prozent aller generativen KI-Vorhaben, weil Unternehmen über keine bereinigten, konsistenten, berechtigungskonformen und einsatzbereiten Datenbestände verfügen. Der Cisco Data Privacy Benchmark unterstreicht denselben Befund für KI: Zwar bestätigen 96 Prozent der weltweit befragten Verantwortlichen, dass erst verlässliche Datenschutzstrukturen echte KI-Agilität ermöglichen, doch fast zwei Drittel der Organisationen scheitern im operativen Alltag am Zugriff auf hochwertige, sauber zweckgebundene Datensätze.",
      to: "KI-Initiativen scheitern vor allem am handwerklichen Fundament: Ohne bereinigte, konsistente und berechtigungskonforme Datenbestände bricht ein Großteil generativer Vorhaben vorzeitig ab. Verlässliche Datenschutzstrukturen gelten als Voraussetzung für KI-Agilität – doch viele Organisationen scheitern im Alltag am Zugriff auf hochwertige, sauber zweckgebundene Datensätze.",
    },
    {
      find: "Cisco-Zahlen belegen denselben Verlust an Vertriebsgeschwindigkeit und die Hebelwirkung einer reifen Architektur: Zwar berichten 78 Prozent der weltweit befragten Unternehmen, durch etablierte Datenschutzstrukturen spürbar agiler am Markt zu agieren, doch wo diese Reife fehlt, bremsen Datenschutzbedenken der Einkaufsabteilungen das Geschäft massiv aus. Während unzureichende oder schlecht dokumentierte Prozesse den Verkaufszyklus durch Rückfragen der Einkäufer bei geringer Prozessreife in der Spitze um bis zu 16 Wochen und im weltweiten Schnitt um 5,4 Wochen verlängern, schrumpft dieser Verzug bei datenschutzreifen Organisationen auf durchschnittlich rund 3 bis 3,4 Wochen zusammen. Über 90 Prozent der untersuchten Unternehmen bestätigen, dass klare Architekturen Verzögerungen im Vertrieb und bei Produkteinführungen signifikant reduzieren, während rund 70 Prozent durch strukturierte Datenschutzprozesse handfeste operative Effizienzgewinne erzielen.",
      to: "Dieselbe Hebelwirkung zeigt sich an der Vertriebsnaht: Wo Reife fehlt, bremsen Datenschutzbedenken der Einkaufsabteilungen das Geschäft massiv aus. Unzureichend dokumentierte Prozesse verlängern den Verkaufszyklus um Wochen; datenschutzreife Organisationen kappen diesen Verzug spürbar und gewinnen Agilität bei Produkteinführungen.",
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
    const swaps = BY_KAPITEL[i + 1];
    if (!swaps?.length) continue;
    const k = book.kapitel[i]!;
    let body = sachbuchKapitelBodyText(k);
    const before = body;
    const missed: string[] = [];
    let n = 0;
    for (const s of swaps) {
      if (!body.includes(s.find)) {
        missed.push(s.find.slice(0, 70));
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
