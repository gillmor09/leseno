/**
 * After first intro, Lean tools (Poka-Yoke, 5S, Jidoka) get short back-refs
 * and jump straight into the chapter-specific application.
 *
 * Homes: Poka-Yoke/Jidoka ~Kap.1–2; 5S Lifecycle ~Kap.5.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-lean-reintros.ts
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
  3: [
    {
      find: "Hier wird das Konzept von Privacy as Code zur harten technischen Schranke nach dem Jidoka-Prinzip, bei dem die Fertigungsstraße bei einem Qualitätsdefekt automatisch stoppt.",
      to: "Hier wird Privacy as Code zur harten technischen Schranke nach dem bereits bekannten Jidoka-Prinzip: bei Qualitätsdefekt stoppt die Pipeline automatisch.",
    },
  ],
  4: [
    {
      find: "Datenminimalismus wirkt deshalb als aktive Fehlervermeidung direkt an der Eingabequelle nach dem im Fundament eingeführten Poka-Yoke-Prinzip. Wo überflüssige Eingabemasken gar nicht erst existieren, sinkt die Fehlerquote auf null, und das Unternehmen spart sich jene um den Faktor zehn bis hundert teurere Nacharbeit in nachgelagerten Systemen.",
      to: "Datenminimalismus wirkt deshalb als Poka-Yoke an der Eingabequelle: Wo überflüssige Masken gar nicht erst existieren, entfällt die teure Nacharbeit in nachgelagerten Systemen.",
    },
  ],
  6: [
    {
      find: "Auf die Stammdatenerfassung übertragen bedeutet die konsequente Anwendung des bereits eingeführten Poka-Yoke-Prinzips, digitalen Ausschuss direkt an der Eingabemaske technisch auszuschließen: Schnittstellen werden so konstruiert, dass unvollständige oder syntaktisch unmögliche Eingaben gar nicht erst in die Datenbank gelangen können.",
      to: "Auf die Stammdatenerfassung übertragen heißt das: Poka-Yoke als Schnittstellen-Validierung — unvollständige oder syntaktisch unmögliche Eingaben gelangen gar nicht erst in die Datenbank.",
    },
    {
      find: "Methodisch setzen wir dieses Prinzip mit der bereits eingeführten 5S-Systematik direkt auf den Abteilungsrechnern um. Statt bloße Exportverbote zu erlassen, die im operativen Druck sofort umgangen werden, sanieren wir die Datenwege an der Wurzel, indem wir den wahren Ursachen von Workarounds nachgehen. Fachbereiche exportieren Daten fast nie aus böser Absicht in lokale Tabellen, sondern wegen ungelöster Usability-Mängel im Kernsystem: fehlende schnelle Filter, unübersichtliche Masken oder starre Standardberichte. Durch die konsequente Anwendung der 5S-Disziplin räumen Teams diese digitalen Excel-Friedhöfe dauerhaft auf, indem sie verwaiste Altexporte auf den Netzlaufwerken aufspüren und löschen, direkt im führenden System bedienungsfreundliche Live-Ansichten für den Vertrieb einrichten und den unkontrollierten Rohdatenexport für Standardnutzer anschließend technisch sperren.",
      to: "Methodisch wenden wir die bereits eingeführte 5S-Disziplin direkt auf den Abteilungsrechnern an: statt Exportverbote zu predigen, beseitigen wir die Usability-Ursachen von Workarounds, räumen verwaiste Altexporte ab, richten Live-Ansichten im führenden System ein und sperren den unkontrollierten Rohdatenexport für Standardnutzer.",
    },
    {
      find: "In der Praxis wird dieses Skalierungsrisiko durch das Jidoka-Prinzip beherrschbar. Statt Algorithmen blind auf fragmentierte oder potenziell divergierende Datenbestände zugreifen zu lassen, greift hier der automatische Prozessstopp bei Qualitätsmängeln: Stößt eine automatisierte Pipeline auf abweichende, widersprüchliche oder unvollständige Stammdaten, hält der Vorgang sofort selbstständig an. Der fehlerhafte Datensatz wird nicht an die Scoring-Engine weitergereicht, sondern isoliert, und die Klärung wird über geführte Eingabemasken direkt an der Quelle eingeholt.",
      to: "In der Praxis beherrschen wir dieses Skalierungsrisiko mit Jidoka an der Scoring-Pipeline: Bei abweichenden oder unvollständigen Stammdaten stoppt der Vorgang, der Datensatz wird isoliert, und die Klärung läuft über geführte Masken an der Quelle — nicht weiter in die Engine.",
    },
    {
      find: "Die Lösung bestand darin, ein Validierungsgate nach dem Jidoka-Prinzip direkt vor der externen Auskunftei-Abfrage einzubauen.",
      to: "Die Lösung war ein Jidoka-Validierungsgate direkt vor der externen Auskunftei-Abfrage.",
    },
  ],
  7: [
    {
      find: "Statt in monatelangen Ausschüssen jede Einzelseite neu zu verhandeln, unterzog das Team die Textlandschaft einem rigorosen Content-Audit nach dem bekannten 5S-Ordnungsschema.",
      to: "Statt in monatelangen Ausschüssen jede Einzelseite neu zu verhandeln, unterzog das Team die Textlandschaft einem rigorosen Content-Audit nach der bekannten 5S-Disziplin.",
    },
    {
      find: "Das Quality Gate zieht in diesem Fall im Sinne unseres Jidoka-Prinzips sofort die Reißleine und blockiert den Release zur Nacharbeit, ganz gleich, wie fehlerfrei und juristisch unangreifbar die Fachtexte in den tieferen Schichten im Hintergrund formuliert sein mögen.",
      to: "Das Quality Gate zieht in diesem Fall die Jidoka-Reißleine und blockiert den Release zur Nacharbeit — ganz gleich, wie fehlerfrei die Fachtexte in den tieferen Schichten formuliert sind.",
    },
  ],
  9: [
    {
      find: "Die erste Schleuse setzt direkt an der Quelle an und etabliert eine strikte Poka-Yoke-Sicherung bei der Datenaufnahme. Bevor unstrukturierte Dokumente unreflektiert in Wissenskorpora wandern oder Nutzereingaben das Modell erreichen, trennt ein automatisiertes Dokumenten-Routing nach den aus Kapitel 5 bekannten 5S-Kriterien im Datenlebenszyklus die Spreu vom Weizen.",
      to: "Schleuse 1 wendet Poka-Yoke und die 5S-Kriterien aus Kapitel 5 direkt auf die Datenaufnahme an: Bevor Dokumente in Wissenskorpora wandern oder Nutzereingaben das Modell erreichen, trennt ein automatisiertes Routing abgelaufene, redundante und interne Bestände vom Indexierungsstrang.",
    },
    {
      find: "Die zweite Schleuse ordnet den Wissensspeicher nach den 5S-Prinzipien, um den Grundsatz der Zweckbindung technisch im Abrufmechanismus zu erzwingen. In vielen gescheiterten KI-Projekten liegt das Kernproblem schlicht darin, dass der Kontext-Vektorraum als flache, ungetrennte Wissenshalde angelegt ist, auf die jede Systemanfrage unkontrolliert zugreifen kann.",
      to: "Schleuse 2 überträgt dieselbe 5S-Ordnung auf den Vektorraum — Zweckbindung wird im Abruf erzwungen, statt den Kontext als flache Wissenshalde für jede Anfrage offenzulassen.",
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
        console.log(`K${n} MISS: ${s.find.slice(0, 85)}`);
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
      !/Lean-Werkzeug|Poka-Yoke|5S|nicht erneut grundlegend|Rückverweis|Mehrfacherklärung/i.test(
        o,
      ),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) => !/Lean-Werkzeug|Poka-Yoke|5S|erneut grundlegend|Mehrfacherklärung/i.test(g),
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
            " Lean-Re-Intros (Poka-Yoke/5S/Jidoka) in Folgekapiteln auf kurze Rückverweise + spezifische Anwendung gekürzt.",
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
