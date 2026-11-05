/**
 * Deep-fix K7 for 10: cut residual redundancy + meta Kapitel-9 bridge.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k7-for-10.ts
 */
import { scoreSachbuchKapitelManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[6]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;

  const swaps: Array<{ find: string; to: string }> = [
    {
      find: "Gutes Information Design wirkt hier wie ein unbestechlicher Vergrößerungsspiegel: Lässt sich der betriebliche Grund für ein Eingabefeld oder einen Datenfluss auf der ersten Ebene des Schichtenmodells nicht in einem oder zwei klaren, für Laien sofort plausiblen Sätzen erklären, liegt die Ursache fast nie in einem redaktionellen Formulierungsnotstand, sondern in einer überdimensionierten technischen Konzeption.",
      to: "Gutes Information Design wirkt hier wie ein unbestechlicher Vergrößerungsspiegel: Greift der bereits am Privacy Solution Canvas gesetzte Grundsatz — was sich auf der ersten Ebene nicht in einem Satz erklären lässt, ist im Backend falsch konstruiert —, stoppt das Quality Gate, bevor unklare Felder und Datenflüsse den Kunden erreichen.",
    },
    {
      find: "Diese Unterlagen belegten schwarz auf weiß und empirisch, dass vier von fünf normalen Anwendern nach der 5-Sekunden-Sichtung der visuellen Hierarchie und dem anschließenden 15-Sekunden-Verständnistest auf Anhieb erfasst hatten, dass sämtliche Sensordaten für die Heizungssteuerung zu hundert Prozent lokal im Heimnetzwerk verbleiben und lediglich der optionale, anonymisierte Postleitzahlen-Abruf für die Wetterprognose sowie technische Statuswerte zur Router-Stabilität nach außen übertragen werden – während sämtliche gesetzlichen Pflichtangaben zu Speicherfristen und Auskunftsrechten auf den nachgelagerten Ebenen zwei und drei jederzeit mit einem Klick vollständig erreichbar blieben.",
      to: "Diese Unterlagen belegten schwarz auf weiß und empirisch, dass vier von fünf normalen Anwendern nach der 5-Sekunden-Sichtung und dem 15-Sekunden-Verständnistest die Kernarchitektur von KlarHome auf Anhieb erfassten — lokale Sensordaten, optionale Komfortabrufe, Pflichtangaben eine Ebene tiefer — und die tieferen Ebenen bei Bedarf mit einem Klick erreichten.",
    },
    {
      find: "er speist später die Sales Velocity, die Kapitel 9 als Gesamtbilanz von neun Wochen auf zwölf Tage ausweist — hier zählt zuerst, dass Klarheit Misstrauen und Nacharbeit ersetzt.",
      to: "er speist später die Sales Velocity im B2B-Geschäft — hier zählt zuerst, dass Klarheit Misstrauen und Nacharbeit ersetzt.",
    },
    {
      find: "Da jede manuelle Bearbeitung solcher Anfragen – wie wir in den vorangegangenen Kapiteln bei der KlarNetz AG gesehen haben – erhebliche interne Prozesskosten verursacht,",
      to: "Da jede manuelle Bearbeitung solcher Anfragen bei KlarNetz erhebliche interne Prozesskosten verursacht,",
    },
  ];

  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log("MISS:", s.find.slice(0, 100));
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log("OK:", s.find.slice(0, 80));
  }

  for (const n of [
    "Kapitel 9 als Gesamtbilanz",
    "Heizungssteuerung zu hundert Prozent lokal",
    "wie wir in den vorangegangenen Kapiteln",
    "überdimensionierten technischen Konzeption",
  ]) {
    console.log(`leftover "${n}":`, text.includes(n));
  }

  if (text !== before) {
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
    console.log("saved");
  }

  console.log("\nRe-scoring K7…");
  const scored = await scoreSachbuchKapitelManuscript({
    sachbuchId: ID,
    kapitelId: k.id,
  });
  const m = scored.kapitel.find((c) => c.id === k.id)!.manuscript;
  console.log("score:", m.salesScore);
  console.log("gaps:", m.gaps);
  console.log("orders:", m.changeOrders);
  console.log("summary:", m.scoreSummary?.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
