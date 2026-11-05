/**
 * Dump last ~900 chars of each chapter + key CTA markers.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-cta-tails.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const MARKERS = [
  "Drei Schritte für den Montagmorgen",
  "Sofort-Umsetzung",
  "Montag-Mittwoch-Freitag",
  "noch in dieser Woche",
  "kommenden Montag",
  "Montagmorgen",
  "Werkzeugkasten",
  "Quick-Start",
  "Praxis-Checkliste",
  "Was Sie am nächsten",
  "Was am Montagmorgen",
  "Berufen Sie noch",
  "Starten Sie noch",
  "Beenden Sie noch",
  "Formieren Sie noch",
  "Nehmen Sie sich für die kommende",
  "90-Tage-Durchbruch",
  "persönlichen Tag 1",
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${i + 1} ${k.title} (${t.length} chars) ========`);
    for (const m of MARKERS) {
      const idx = t.indexOf(m);
      if (idx >= 0) {
        console.log(
          `  [${m}] @${idx}: …${t.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, " ")}…`,
        );
      }
    }
    console.log("--- TAIL ---");
    console.log(t.slice(-1100).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
