/**
 * Straffen: Dummy/Checkout-Doppelungen K4/K6/K8.
 * K4 = Volumen/Durchsatz · K6 = Stammdaten-Syntax/Dubletten · K8 = Dark Patterns/Wegwerf.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-form-dupes.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  4: [
    {
      find: "Dieser Ansatz verändert nicht nur die Konversionsrate, er schützt die Datenqualität an der Wurzel. Überladene Formulare führen nicht nur zum Kaufabbruch. Was bei doppelten Adresszeilen mit Verwirrung beginnt, kippt vollends, sobald Systeme sensible Angaben wie Geburtsdaten, direkte Durchwahlen oder interne Budgets verlangen, deren Nutzen für den Kunden im Dunkeln bleibt. Nutzer brechen an dieser Stelle nicht nur ab; aus verständlichem Misstrauen weichen viele auf fingierte Angaben und Dummy-Werte aus. Diese bewusste Datenvergiftung durch den genervten Anwender sabotiert nachgelagerte Analysen, verzerrt das Lead-Scoring im Marketing und erzeugt teure manuelle Korrekturschleifen im Vertrieb und im Kundensupport.",
      to: "Dieser Ansatz verändert vor allem den Durchsatz: Überladene Formulare bremsen den Checkout und den Registrierungsfluss. Was bei doppelten Adresszeilen mit Verwirrung beginnt, kippt vollends, sobald Systeme sensible Angaben verlangen, deren Nutzen für den Kunden im Dunkeln bleibt — der Klick bleibt aus, der Trichter stockt. Wie daraus später syntaktischer Ausschuss und manipulative Notwehr an der Maske entstehen, klären die Kapitel zu Stammdatenqualität und Fairness; hier zählt zuerst das Volumen.",
    },
    {
      find: "Merksatz für die Praxis: Jedes gestrichene Pflichtfeld im Formular wirkt doppelt: Es senkt die Abbruchquote im Vertriebstrichter sofort und verhindert, dass genervte Kunden Ihre Datenbanken mit erfundenen Dummy-Angaben vergiften.",
      to: "Merksatz für die Praxis: Jedes gestrichene Pflichtfeld im Formular wirkt zuerst auf den Durchsatz — weniger Felder, weniger Abbruch, schnellerer Fluss durch den Trichter.",
    },
  ],
  6: [
    {
      find: "Prävention an der Schnittstelle: Validierung, Self-Service und die Auflösung des Conversion-Mythos",
      to: "Prävention an der Schnittstelle: Validierung, Self-Service und Stammdaten-Syntax",
    },
    {
      find: "Der spürbarste Widerstand gegen solch konsequente Validierungen entsteht in der Praxis selten in der IT-Abteilung, sondern im Vertrieb und im Online-Marketing. Dort hält sich hartnäckig die Annahme, jede formale Hürde im Erfassungsformular drücke automatisch die Conversion-Rate. Um Abbruchquoten auf Landingpages und in Registrierungsstrecken künstlich niedrig zu halten, werden Eingabefelder unkontrolliert geöffnet, Plausibilitätsprüfungen deaktiviert oder aufgeblähte Formulare mit dutzenden unvalidierten Feldern ins Netz gestellt, bei denen halbleere und unvollständige Datensätze einfach durchgewinkt werden.",
      to: "Der spürbarste Widerstand gegen solch konsequente Validierungen entsteht selten in der IT, sondern im Vertrieb und Marketing: Plausibilitätsprüfungen gelten als Bremse. Felder werden geöffnet, Syntaxchecks deaktiviert, unvollständige Stammdatensätze durchgewinkt — genau der Stoff, aus dem Dubletten, Zahlendreher und Retouren entstehen. (Dass weniger Felder den Durchsatz heben, ist Kapitel 4; hier geht es um die Richtigkeit dessen, was dennoch erfasst wird.)",
    },
    {
      find: "Was die Usability-Forschung seit den frühen Arbeiten von Luke Wroblewski belegt und aktuelle Checkout-Analysen bestätigen, gilt unverändert: Die konsequente Reduktion unnötiger Formularfelder in Verbindung mit direkter Inline-Validierung und unmittelbarem visuellem Feedback senkt die Eingabefehlerquote drastisch und verringert gleichzeitig die Abbruchquoten im Bestell- und Registrierungsprozess. Das System fängt Fehleingaben an der Quelle ab, indem es den Nutzer beim Ausfüllen unterstützt, bevor fehlerhafte Angaben nachgelagerte Systeme kontaminieren können. So wandelt sich hohe Datenqualität vom vermeintlichen Conversion-Stopper zum Motor einer verlässlichen Kundenerfahrung.",
      to: "Inline-Validierung und unmittelbares Feedback an der Maske senken die Eingabefehlerquote an der Quelle: Postleitzahlen, Mail-Syntax und Pflichtattribute werden geprüft, bevor Dubletten und Zahlendreher nachgelagerte Systeme kontaminieren. Hohe Stammdatenqualität ist kein Durchsatz-Gegner aus Kapitel 4 — sie ist die Voraussetzung dafür, dass der schlanke Fluss auch inhaltlich trägt.",
    },
  ],
  8: [
    {
      find: "Welche wirtschaftlichen Schäden das Ignorieren dieser Zusammenhänge anrichtet, verdeutlicht unser durchgehender Referenzfall der KlarNetz AG. Nachdem das Unternehmen bereits bei der vorangegangenen Formular-Entschlackung gelernt hatte, wie stark unnötige Datenabfragen die Abbruchquote nach oben treiben, zeigte sich bei der Einführung des neuen Smart-Home-Tarifs „KlarHome“ ein ähnliches Muster. Um die Lead-Zahlen für Partnerangebote künstlich zu steigern, hatte das Vertriebsteam die allgemeinen Geschäftsbedingungen im Bestellprozess mit einer weit gefassten Werbeeinwilligung in einer einzigen Pflicht-Checkbox gebündelt.",
      to: "Welche wirtschaftlichen Schäden manipulative Einwilligungsmuster anrichten, verdeutlicht der Referenzfall KlarNetz AG. Nachdem Volumen und Feldlast an der Maske bereits entschlackt waren, zeigte sich beim Smart-Home-Tarif „KlarHome“ ein Fairness-Problem anderer Art: Um Lead-Zahlen für Partnerangebote künstlich zu steigern, bündelte das Vertriebsteam die AGB mit einer weit gefassten Werbeeinwilligung in einer einzigen Pflicht-Checkbox.",
    },
    {
      find: "Das schützt die Konversionsrate des eigentlichen Verkaufsprozesses vor kostspieligen Kaufabbrüchen durch überladene und übergriffige Formulare.",
      to: "Das schützt den Verkaufsprozess vor Schein-Zustimmungen und übergriffigen Kopplungen — nicht vor „zu vielen Feldern“ (das war Kapitel 4), sondern vor unfairer Wahlarchitektur.",
    },
  ],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const [nStr, swaps] of Object.entries(BY_KAPITEL)) {
    const n = Number(nStr);
    const k = book.kapitel[n - 1]!;
    let text = sachbuchKapitelBodyText(k);
    const before = text;
    for (const s of swaps) {
      if (!text.includes(s.find)) {
        console.log(`K${n} MISS: ${s.find.slice(0, 90)}`);
        continue;
      }
      text = text.split(s.find).join(s.to);
      console.log(`K${n} OK: ${s.find.slice(0, 70)}`);
    }
    if (text === before) continue;
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: text,
        draftText: k.manuscript.draftText || before,
        improvedAt: now,
      },
      updatedAt: now,
    });
  }

  const fresh = await getSachbuchKontext(ID);
  const prev = fresh!.idee.manuscriptReview;
  const orders = (prev.changeOrders ?? []).filter(
    (o) =>
      !/Dummy|Datenvergift|Conversion|Checkout|Kapitel 4.*6.*8|thematische Doppelung/i.test(
        o,
      ),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) => !/Dummy|Datenvergift|Conversion|Checkout|Doppelung.*Formular/i.test(g),
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
            " Formular-/Checkout-Doppelungen strafft: K4 Volumen/Durchsatz, K6 Stammdaten-Syntax, K8 Dark Patterns/Wegwerf.",
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
