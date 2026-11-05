/**
 * Dump open book + chapter change orders for Lean Privacy Sachbuch.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const bookOrders = book.idee.manuscriptReview?.changeOrders ?? [];
  const gaps = book.idee.manuscriptReview?.gaps ?? [];
  const chapter = book.kapitel.map((k, i) => ({
    kap: i + 1,
    title: k.title,
    score: k.manuscript.salesScore,
    orders: k.manuscript.changeOrders ?? [],
    gaps: k.manuscript.gaps ?? [],
  }));
  const out = {
    bookScore: book.idee.manuscriptReview?.salesScore ?? null,
    bookOrders,
    gaps,
    chapter,
  };
  writeFileSync("scripts/tmp-open-orders.json", JSON.stringify(out, null, 2), "utf8");
  console.log("book score", out.bookScore);
  console.log("book orders", bookOrders.length);
  bookOrders.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  console.log("gaps", gaps.length);
  gaps.forEach((g, i) => console.log(`  g${i + 1}. ${g}`));
  for (const c of chapter) {
    if (c.orders.length || c.gaps.length) {
      console.log(`\nK${c.kap} score=${c.score} orders=${c.orders.length}`);
      c.orders.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
