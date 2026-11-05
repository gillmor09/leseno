import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchManuscriptOverallSalesScore,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const overall = sachbuchManuscriptOverallSalesScore(book);
  const rev = book.idee.manuscriptReview;
  console.log("book review score:", rev.salesScore, "scoredAt:", rev.scoredAt);
  console.log("book model:", rev.modelSlug);
  console.log("book gaps/orders:", rev.gaps.length, rev.changeOrders.length);
  console.log("overall UI:", overall);
  console.log("summary:", rev.scoreSummary?.slice(0, 350));
  console.log("\nchapters:");
  let sum = 0;
  let n = 0;
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const draftW = countSachbuchWords(k.manuscript.draftText);
    const impW = countSachbuchWords(k.manuscript.improvedText);
    const bodyW = countSachbuchWords(sachbuchKapitelBodyText(k));
    const s = k.manuscript.salesScore;
    if (s != null) {
      sum += s;
      n += 1;
    }
    console.log(
      `K${i + 1} score=${s ?? "—"} orders=${k.manuscript.changeOrders.length} gaps=${k.manuscript.gaps.length} draftW=${draftW} improvedW=${impW} bodyW=${bodyW} scoredAt=${k.manuscript.scoredAt ?? "—"} improvedAt=${k.manuscript.improvedAt ?? "—"}`,
    );
    if (k.manuscript.changeOrders[0]) {
      console.log("  CO0:", k.manuscript.changeOrders[0].slice(0, 120));
    }
  }
  console.log("\nchapter mean:", n ? (sum / n).toFixed(2) : "—");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
