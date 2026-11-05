/**
 * Cut Kap.9 VDP-pyramid recap (~half) so RAG near-miss lands sooner.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-cut-k9-pyramid-intro.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const FIND = `Die praktische Übersetzung dieser Haltung in den Betriebsalltag leistet das operative System der Value-Driven Privacy, kurz VDP, entlang seiner dreistufigen Pyramide. Im strategischen und risikobasierten Fundament, das wir in den Kapiteln 1 und 2 gelegt haben, verschmelzen das Mindset des Privacy Value Thinking und die Übersetzung rechtlicher Prinzipien wie Rechtmäßigkeit, Zweckbindung, Integrität und Rechenschaftspflicht in klare Qualitätsmaßstäbe. Zusammen mit einem integrierten Enterprise Risk Management samt Risiko-Triage und kontinuierlichen Steuerungszyklen nach dem Plan-Do-Check-Act-Prinzip entsteht so ein unverrückbarer Sockel, auf dem Rechtmäßigkeit nicht als bürokratisches Verbotsschild fungiert, sondern als saubere Zweckarchitektur für verlässliche Handlungsfähigkeit. Im darüberliegenden methodischen Motor bündeln die Kapitel 3 bis 6 schlanke Prozess-, Lean- und Architektur-Instrumente, die direkt in den Datenfluss eingreifen. Das 5-stufige Nachweissystem, das Privacy Solution Canvas, systematische 5S-Bereinigungen im Datenlebenszyklus vor dem Indexieren, strikte Zweckbindung am Vektorraum und mechanische Poka-Yoke-Schranken verhindern Fehler direkt an der Quelle, noch bevor ein Sprachmodell mit sensiblen Rohdaten in Berührung kommt; zeitraubende und teure Nacharbeit entfällt dadurch von vornherein. An der Spitze der Pyramide, dem in den Kapiteln 7 und 8 ausgearbeiteten Kundenergebnis, verwandelt sich diese interne Disziplin durch gelebte Fairness, verständliche Transparenz an den digitalen Kontaktpunkten und prüffähige Nachweise im Vertrieb in eine messbare User und Customer Experience. Diese stiftet spürbares Nutzervertrauen sowie höhere Konversionsraten und gibt jedem rechtlichen Grundprinzip ein wirksames methodisches Gegenstück im laufenden Betrieb.

Wer diesen Systemansatz im Kontext moderner Algorithmen zu Ende denkt, erkennt die zeitlose Gültigkeit der industriellen Qualitätslehre: Qualität lässt sich nicht am Ende eines Prozesses hineinprüfen. Daten sind das Rohmaterial digitaler Wertströme, und künstliche Intelligenz vervielfacht jeden strukturellen Konstruktionsfehler in Bruchteilen einer Sekunde, wenn das handwerkliche Fundament fehlt. In der Praxis scheitern viele KI-Initiativen vor allem an diesem fehlenden Fundament: Ohne bereinigte, konsistente und berechtigungskonforme Datenbestände bricht ein Großteil generativer Vorhaben vorzeitig ab. Verlässliche Datenschutzstrukturen sind die zwingende Voraussetzung für KI-Agilität – doch viele Organisationen scheitern im Alltag am Zugriff auf hochwertige, sauber zweckgebundene Datensätze. Dieses Scheitern an der eigenen Datenbasis löst in vielen Führungsetagen Lähmung aus. Aus Angst vor Kontrollverlust verhängen Vorstände pauschale Verbote, anstatt ihre Datenpipelines strukturell zu sanieren.

Wie real diese Dynamik ist, zeigt das Beispiel unseres fiktiven Referenzunternehmens, der KlarNetz AG – jenem mittelständischen IT- und Kommunikationsdienstleister, der reale Praxisfälle bündelt und dessen Transformation wir über seine zwei Geschäftssparten hinweg begleitet haben.`;

const TO = `Value-Driven Privacy übersetzt diese Haltung in die dreistufige Pyramide der vorangegangenen Kapitel: Fundament (Kapitel 1–2), Motor (Kapitel 3–6) und Kundenergebnis (Kapitel 7–8). Qualität lässt sich nicht am Ende hineinprüfen — und KI vervielfacht jeden strukturellen Fehler in Sekundenbruchteilen. Viele generative Vorhaben scheitern deshalb nicht am Modell, sondern an ungeklärten Beständen; Vorstände verhängen dann pauschale Verbote, statt Pipelines zu sanieren.

Wie real diese Dynamik ist, zeigt unser Referenzunternehmen KlarNetz AG.`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[8]!;
  const before = sachbuchKapitelBodyText(k);
  if (!before.includes(FIND)) {
    console.log("MISS — dump pyramid start");
    const i = before.indexOf("dreistufigen Pyramide");
    console.log(before.slice(Math.max(0, i - 80), i + 1200));
    process.exit(1);
  }
  const after = before.split(FIND).join(TO);
  const now = new Date().toISOString();
  const wBefore = countSachbuchWords(FIND);
  const wAfter = countSachbuchWords(TO);
  console.log(`pyramid+bridge words: ${wBefore} → ${wAfter} (−${wBefore - wAfter}, ${Math.round((1 - wAfter / wBefore) * 100)}%)`);

  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: after,
      draftText: k.manuscript.draftText || before,
      improvedAt: now,
    },
    updatedAt: now,
  });

  const rag = after.search(/Noch während die große Trockenlegung/);
  const opening = after.slice(0, rag > 0 ? rag : 3000);
  console.log("words until RAG scene:", countSachbuchWords(opening));

  const fresh = await getSachbuchKontext(ID);
  const prev = fresh!.idee.manuscriptReview;
  const orders = (prev.changeOrders ?? []).filter(
    (o) => !/Pyramide|Kapitel 1 bis 8|einleitende Zusammenfassung|RAG-Beinahe|dramatischem Zug/i.test(o),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) => !/Pyramide|Kapitel 1 bis 8|einleitende Zusammenfassung|RAG/i.test(g),
  );
  if (
    orders.length !== (prev.changeOrders ?? []).length ||
    gaps.length !== (prev.gaps ?? []).length
  ) {
    await patchSachbuchBook(ID, {
      idee: {
        ...fresh!.idee,
        manuscriptReview: {
          ...prev,
          changeOrders: orders,
          gaps,
          scoredAt: new Date().toISOString(),
          scoreSummary:
            (prev.scoreSummary?.trim() || "Buch-Verkaufsreife 9/10.") +
            " Kap.9-Pyramiden-Rekapitulierung gekürzt; schnellerer Einstieg ins RAG-Beinahe-Desaster.",
        },
      },
    });
    console.log("review: matching CO removed");
  } else {
    console.log("review: no matching CO (left as-is)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
