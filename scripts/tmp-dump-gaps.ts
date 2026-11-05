/**
 * Dump book + chapter manuscript critique state.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-gaps.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchBookCritiqueForChapter,
  sachbuchKapitelNeedsManuscriptImprove,
  sachbuchManuscriptOverallSalesScore,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const overall = sachbuchManuscriptOverallSalesScore(book);
  const rev = book.idee.manuscriptReview;
  console.log("=== BUCH ===");
  console.log("overall:", overall);
  console.log("scoredAt:", rev?.scoredAt);
  console.log("salesScore:", rev?.salesScore);
  console.log("summary:", (rev?.scoreSummary ?? "").slice(0, 500));
  console.log("\n-- gaps (", rev?.gaps?.length ?? 0, ") --");
  for (const g of rev?.gaps ?? []) console.log(" •", g);
  console.log("\n-- changeOrders (", rev?.changeOrders?.length ?? 0, ") --");
  for (const o of rev?.changeOrders ?? []) console.log(" •", o);
  console.log("\n=== KAPITEL ===");
  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const needs = sachbuchKapitelNeedsManuscriptImprove(book, k.id);
    const crit = sachbuchBookCritiqueForChapter(book, k.id);
    const improved = countSachbuchWords(k.manuscript.improvedText);
    const draft = countSachbuchWords(k.manuscript.draftText);
    console.log(
      `K${i + 1}: score=${k.manuscript.salesScore ?? "—"} improved=${improved}w draft=${draft}w needsImprove=${needs} bookOrders=${crit.orders.length} bookGaps=${crit.gaps.length} kapOrders=${k.manuscript.changeOrders.length} kapGaps=${k.manuscript.gaps.length} improvedAt=${k.manuscript.improvedAt ?? "—"}`,
    );
    if (k.manuscript.gaps.length) {
      for (const g of k.manuscript.gaps.slice(0, 4)) console.log("   gap:", g.slice(0, 120));
    }
    if (crit.orders.length) {
      for (const o of crit.orders.slice(0, 3)) console.log("   →bookCO:", o.slice(0, 120));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
