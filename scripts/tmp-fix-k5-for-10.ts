/**
 * Deep-fix K5 for 10: smooth lektoratsähnliche Pilot-Übergänge + pyramid term.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k5-for-10.ts
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
  const k = book.kapitel[4]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;

  const swaps: Array<{ find: string; to: string }> = [
    {
      find: "Was folgt, ist der Erfahrungsbericht eines lokalen Support-Piloten — ein früher Bereichserfolg, lange bevor KlarNetz den Umbau unternehmensweit verdichtete.",
      to: "Was folgt, ist der Erfahrungsbericht aus dem Kundensupport der KlarNetz AG — dem ersten Bereich, in dem automatisiertes Löschen in den Regelbetrieb ging.",
    },
    {
      find: "Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; KlarNetz skalierte später genau diese Erfahrung auf das gesamte Unternehmen.",
      to: "Retrospektiv wurde dieses lokale Pilot-Quartal zum Vorbild; KlarNetz übertrug dieselbe Arbeitsweise später auf weitere Unternehmensbereiche.",
    },
    {
      find: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause für den späteren unternehmensweiten Ausbau.",
      to: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — ein wiederholbares Vorgehen, das andere Bereiche später übernehmen konnten.",
    },
    {
      find: "sondern als standardisierte Blaupause für die unternehmensweite Skalierung nutzt.",
      to: "sondern als wiederholbares Muster für die Skalierung auf weitere Bereiche nutzt.",
    },
    {
      find: "zeigt der Blick ins zweite Betriebsjahr: Nach dem Support-Piloten und etablierter Löschhygiene sinkt das Migrationsvolumen — ein Reifegrad-Ergebnis der ersten Bereichserfolge, noch bevor KlarNetz den Gesamtumbau konzernweit bilanzierte.",
      to: "zeigt der Blick ins zweite Betriebsjahr nach dem Support-Piloten: Mit etablierter Löschhygiene sank das Migrationsvolumen deutlich — messbarer Reifegewinn aus dem ersten bereinigten Bereich.",
    },
    {
      find: "Übersichtskasten: Das vierstufige VDP-Reifegradmodell der operativen Löschfähigkeit",
      to: "Übersichtskasten: Das vierstufige Reifegradmodell der operativen Löschfähigkeit",
    },
    {
      find: "Im methodischen Gefüge unserer Wertschöpfungspyramide ist damit das tragfähige Fundament der Datenhygiene vollständig gelegt:",
      to: "Im methodischen Gefüge der Qualitäts-Pyramide des Privacy Value Thinking ist damit das tragfähige Fundament der Datenhygiene vollständig gelegt:",
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

  // leftover meta tone
  for (const n of [
    "lange bevor KlarNetz den Umbau",
    "konzernweit bilanzierte",
    "Blaupause",
    "Bereichserfolg, lange bevor",
    "Wertschöpfungspyramide",
    "VDP-Reifegradmodell",
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

  console.log("\nRe-scoring K5…");
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
