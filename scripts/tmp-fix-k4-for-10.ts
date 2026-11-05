/**
 * Deep-fix K4 for 10: ending bridge must match book order (K5 = Löschen)
 * without re-teasing topics already solved in this chapter.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k4-for-10.ts
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
  const k = book.kapitel[3]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;

  const swaps: Array<{ find: string; to: string }> = [
    {
      find: "Vom schlanken Durchsatz zur belastbaren Datenqualität",
      to: "Vom schlanken Durchsatz zur Betriebsfähigkeit des Löschens",
    },
    {
      find: `Damit schließt sich der operative Kreis über die gesamte Wertschöpfungskette hinweg: Von der radikalen Entschlackung der Eingabemasken am ersten Kundenkontaktpunkt über verbindliche Datenbudgets und serverseitige Filter-Gateways bis hin zu synthetischen Teststrecken, automatisierter Partitionierung und der systematischen Tilgung historischer Datenschulden im Maschinenraum greift überall dieselbe Gesetzmäßigkeit. Weniger Daten bedeuten an jeder einzelnen Station weniger Reibung, geringere Infrastrukturkosten, kleinere Angriffsflächen und messbar mehr operativen Durchsatz.

Doch schlanker Durchsatz allein reicht nicht: Was an Daten verbleibt, muss auch wieder beherrschbar verschwinden können. Nachdem wir den Prozess von unnötigem Volumen befreit haben, widmet sich das nächste Kapitel der operativen Speicherbegrenzung — wie Löschen von der Papierpflicht zur belastbaren Betriebsfähigkeit wird und historische Datenschulden systematisch trockengelegt werden.`,
      to: `Damit schließt sich der operative Kreis über die gesamte Wertschöpfungskette hinweg: Von der radikalen Entschlackung der Eingabemasken am ersten Kundenkontaktpunkt über verbindliche Datenbudgets und serverseitige Filter-Gateways bis hin zu synthetischen Teststrecken, automatisierter Partitionierung und der systematischen Tilgung historischer Datenschulden im Maschinenraum greift überall dieselbe Gesetzmäßigkeit. Weniger Daten bedeuten an jeder einzelnen Station weniger Reibung, geringere Infrastrukturkosten, kleinere Angriffsflächen und messbar mehr operativen Durchsatz.

Doch technische Volumenkontrolle allein macht aus Löschen noch keine organisatorische Betriebsfähigkeit. Die Muster für Retention und Partitionierung stehen; im nächsten Kapitel geht es darum, wie KlarNetz und vergleichbare Organisationen das Löschen vom lästigen Papierkram zur gelebten Routine im Support, in der Lifecycle-Steuerung und im Alltag der Fachbereiche machen — und welche Kosten entstehen, wenn Speichern billig wirkt, Löschen aber organisatorisch scheitert. Stammdatenqualität und Fairness an der Kundenschnittstelle folgen danach, sobald Volumen und Löschfähigkeit beherrscht sind.`,
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

  // sanity: ending should not re-announce Drop-Partition as next-chapter novelty
  const end = text.slice(-900);
  console.log("\n===== NEW END =====\n", end);
  if (/nächste Kapitel der operativen Speicherbegrenzung|historische Datenschulden systematisch trockengelegt werden/.test(end)) {
    console.log("WARN: old teaser still present");
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

  console.log("\nRe-scoring K4…");
  const scored = await scoreSachbuchKapitelManuscript({
    sachbuchId: ID,
    kapitelId: k.id,
  });
  const m = scored.kapitel.find((c) => c.id === k.id)!.manuscript;
  console.log("score:", m.salesScore);
  console.log("gaps:", m.gaps);
  console.log("orders:", m.changeOrders);
  console.log("summary:", m.scoreSummary?.slice(0, 450));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
