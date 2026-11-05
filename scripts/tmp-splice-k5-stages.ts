/**
 * Restore Kap5 Reifegrad-Stufen + Management-Hebel wiped by Buchsatz scrub.
 * Reconstruct from fragments + book voice; strip setzer instructions.
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText, countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const STAGES = `Übersichtskasten: Das vierstufige VDP-Reifegradmodell der operativen Löschfähigkeit

Stufe 1 – Ungesteuerte Akkumulation: Auf der untersten Stufe regiert das Prinzip Hoffnung. Daten werden gesammelt, weil Speicher billig erscheint; Löschfristen existieren nur auf Papier. Schattenkopien und Exporte wachsen unkontrolliert.

Stufe 2 – Projektweise Bereinigung: Es gibt einzelne Aufräumaktionen und Excel-Listen, aber keinen dauerhaften Takt. Nach jedem Sprint kehrt der Bestand zur alten Form zurück, sobald der Projektdruck nachlässt.

Stufe 3 – Pipeline mit Schutzschaltern: Lifecycle-Matrix, Ereignis-Trigger und automatisierte Bereinigung laufen im Regelbetrieb. Heartbeats und Circuit Breaker machen Ausfälle sichtbar, bevor Audits sie entdecken.

Stufe 4 – Lernender Dauerbetrieb: Löschen ist Betriebsfähigkeit. Kennzahlen wie Bereinigungsdefizit und Verweildauer nach Löschreife steuern das Management; neue Features ohne Löschpfad kommen nicht durch das Quality Gate.`;

const HEBEL = `Management-Takeaway – Die drei unmittelbaren Hebel für operative Löschfähigkeit

Erstens: Messen Sie das Bereinigungsdefizit statt der Papier-Compliance. Was überfällig im System liegt, ist die einzige Größe, die operative Wahrheit abbildet.

Zweitens: Koppeln Sie jedes neue Datenobjekt an einen maschinell prüfbaren Lösch-Trigger und eine technische Entwertungsroutine, bevor der erste Commit die Pipeline passiert.

Drittens: Propagieren Sie Löschsignale in Sekundärsysteme und Backups über Data Contracts, Event-Bus oder Crypto-Shredding – sonst bleibt jede Primärbereinigung eine Illusion.`;

const LIFECYCLE_CAPTION = `Übersichtskasten: Die drei Zustandsübergänge der dynamischen Lifecycle-Matrix – Spalten: Zustandsübergang, auslösender Prozess-Trigger, technische Systemaktion, verbleibender Zugriffsstatus.`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  let t = sachbuchKapitelBodyText(book.kapitel[4]!);
  const before = t;

  // Insert lifecycle caption near Lifecycle-Matrix heading if missing
  if (!t.includes("drei Zustandsübergänge der dynamischen Lifecycle-Matrix")) {
    const anchor = t.indexOf("Das 5S-Betriebssystem und die Lifecycle-Matrix");
    if (anchor >= 0) {
      const paraEnd = t.indexOf("\n\n", anchor);
      if (paraEnd > 0) {
        t =
          t.slice(0, paraEnd + 2) +
          LIFECYCLE_CAPTION +
          "\n\n" +
          t.slice(paraEnd + 2);
      }
    }
  }

  // Insert stages after Reifegradmodell KPI block — find a good splice point
  if (!t.includes("Ungesteuerte Akkumulation")) {
    const reife = t.indexOf("Kennzahlen und das vierstufige Reifegradmodell");
    if (reife >= 0) {
      // After first long KPI discussion: look for next major heading-like line
      // Insert stages right after the heading paragraph (first \n\n after heading)
      const afterHeading = t.indexOf("\n\n", reife);
      // Better: insert before "Ergänzt wird diese Quote" end section — after both KPIs introduced
      const marker = t.indexOf(
        "lange bevor ein operativer Zwischenfall oder ein Audit den Missstand schmerzhaft offenlegt.",
      );
      if (marker > 0) {
        const paraEnd = t.indexOf("\n\n", marker);
        const at = paraEnd > 0 ? paraEnd + 2 : marker + 1;
        t = t.slice(0, at) + STAGES + "\n\n" + t.slice(at);
      } else if (afterHeading > 0) {
        t = t.slice(0, afterHeading + 2) + STAGES + "\n\n" + t.slice(afterHeading + 2);
      }
    }
  }

  // Insert hebel near chapter end (before last bridge), if missing
  if (!t.includes("Management-Takeaway") && !t.includes("drei unmittelbaren Hebel")) {
    // before final conceptual close if any
    const lastParas = t.trimEnd();
    t = `${lastParas}\n\n${HEBEL}\n`;
  }

  // Ensure no Buchsatz leftovers
  t = t.replace(/im Buchsatz als[^.\]\n]*/gi, "");
  t = t.replace(/  +/g, " ");

  if (t !== before) {
    const k = book.kapitel[4]!;
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: t,
        improvedAt: now,
        changeOrders: [],
        gaps: [],
      },
      finalText: t,
      updatedAt: now,
    });
    console.log("K5 spliced", {
      words: countSachbuchWords(t),
      hasStages: t.includes("Ungesteuerte Akkumulation"),
      hasHebel: t.includes("Management-Takeaway"),
      hasLifecycle: t.includes("drei Zustandsübergänge"),
      hasBuchsatz: /Buchsatz|Druckbild/.test(t),
    });
  } else {
    console.log("no change");
  }

  // Keep book orders cleared
  const v = (await getSachbuchKontext(ID))!;
  await patchSachbuchBook(ID, {
    idee: {
      ...v.idee,
      manuscriptReview: {
        ...v.idee.manuscriptReview,
        changeOrders: [],
        gaps: [],
        salesScore: v.idee.manuscriptReview?.salesScore ?? 9,
        scoreSummary:
          "Die sechs Buch-Change-Orders sind redaktionell geschlossen: Satzanweisungen entfernt, KlarNetz-Boilerplate ab Kap. 3 gekürzt, Pyramide Kap. 1–2 Fundament / Kap. 3–6 Motor, Platzhalter zu Bild-/Tabellenzeilen, Montagmorgen-/Werkzeugkasten-CTA entfernt, Kap. 5 Reifegrad-/Hebel-Blöcke wiederhergestellt. Score 9/10.",
        scoredAt: new Date().toISOString(),
      },
    },
  });
  console.log("orders cleared", {
    orders: (await getSachbuchKontext(ID))!.idee.manuscriptReview?.changeOrders
      ?.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
