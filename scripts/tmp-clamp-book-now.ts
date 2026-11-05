import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  console.log("Re-scoring book with honest chapter clamp…");
  const book = await scoreSachbuchBookManuscript(ID);
  const rev = book.idee.manuscriptReview;
  console.log("book:", rev.salesScore, "gaps", rev.gaps.length, "orders", rev.changeOrders.length);
  console.log("summary:", rev.scoreSummary?.slice(0, 280));
  for (const o of rev.changeOrders) console.log("O:", o.slice(0, 160));
  const scores = book.kapitel.map(
    (k, i) =>
      `K${i + 1}:${k.manuscript.salesScore}(o${k.manuscript.changeOrders.length})`,
  );
  console.log(scores.join(" "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
