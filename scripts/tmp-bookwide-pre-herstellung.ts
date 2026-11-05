/**
 * Book-wide pre-Herstellung audit: scores, open critique, residual nits.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
  sachbuchManuscriptOverallSalesScore,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NIT_PATTERNS: Array<[string, RegExp]> = [
  ["VDP-Pyramide", /VDP-Pyramide/g],
  ["Wertschöpfungspyramide (ohne PVT)", /Wertschöpfungspyramide/g],
  ["90-Tage-Verdichtung", /90-Tage-Verdichtung/g],
  ["Kapitel-N meta", /(?:aus|in|ist|war|folgt|bevor|bilanzen?\w*)\s+Kapitel\s+\d/gi],
  ["Kapitel N als …", /Kapitel\s+\d\s+als\s+/gi],
  ["Art./Artikel DSGVO", /\b(?:Art\.|Artikel)\s*\d+/gi],
  ["Markdown heading", /^#{1,3}\s/gm],
  ["**bold**", /\*\*[^*]+\*\*/g],
  ["Montag-CTA", /Montagmorgen|Montag-Mittwoch-Freitag|noch in dieser Woche mit|kommender Montag\s*=/gi],
  ["Tippfehler", /\b(?:tatslich\w*|konsequenzten|unzurenden|Abbsatz)\b/gi],
  ["personenbezogenen Daten fällt", /Verarbeitung personenbezogenen Daten/g],
  ["Zusammenspiel PVT und VDP", /Zusammenspiel aus Privacy Value Thinking und Value-Driven Privacy/g],
  ["Lektor-Meta", /noch nicht die Sales|bilanzen wir erst|das war Kapitel|ist Kapitel \d;|Lektorat/gi],
  ["Blaupause meta", /Blaupause/g],
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const overall = sachbuchManuscriptOverallSalesScore(book);
  const rev = book.idee.manuscriptReview;

  console.log("=== BOOK ===");
  console.log("title:", book.title);
  console.log("book score:", rev.salesScore, "UI:", overall.score, overall.source);
  console.log("book gaps:", rev.gaps.length, rev.gaps);
  console.log("book orders:", rev.changeOrders.length, rev.changeOrders);
  console.log("summary:", (rev.scoreSummary || "").slice(0, 350));

  console.log("\n=== CHAPTERS ===");
  let below10 = 0;
  let openChapterOrders = 0;
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const m = k.manuscript;
    const s = m.salesScore;
    if (s != null && s < 10) below10 += 1;
    openChapterOrders += m.changeOrders.length;
    console.log(
      `K${i + 1} ${s ?? "—"}/10 orders=${m.changeOrders.length} gaps=${m.gaps.length} needsImprove=${sachbuchKapitelNeedsManuscriptImprove(book, k.id)} | ${k.title.slice(0, 48)}`,
    );
    for (const o of m.changeOrders) console.log("   O:", o.slice(0, 160));
    for (const g of m.gaps) console.log("   G:", g.slice(0, 160));
  }
  console.log(`\nbelow10: ${below10}, openChapterOrders: ${openChapterOrders}`);

  console.log("\n=== NIT SWEEP ===");
  const totals: Record<string, number> = {};
  for (let i = 0; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    for (const [label, re] of NIT_PATTERNS) {
      re.lastIndex = 0;
      const hits = [...t.matchAll(re)];
      if (!hits.length) continue;
      totals[label] = (totals[label] ?? 0) + hits.length;
      console.log(`\nK${i + 1} ${label} ×${hits.length}`);
      for (const h of hits.slice(0, 4)) {
        const idx = h.index ?? 0;
        console.log(" ", JSON.stringify(t.slice(Math.max(0, idx - 50), idx + h[0].length + 70)));
      }
    }
  }
  console.log("\n=== NIT TOTALS ===");
  console.log(JSON.stringify(totals, null, 2));

  // Ending bridges: last 280 chars each
  console.log("\n=== CHAPTER END BRIDGES ===");
  for (let i = 0; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    const end = t.slice(-280).replace(/\s+/g, " ");
    console.log(`K${i + 1}: …${end}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
