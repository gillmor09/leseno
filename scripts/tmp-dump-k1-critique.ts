import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[0]!;
  const m = k.manuscript;
  console.log("title:", k.title);
  console.log("score:", m.salesScore);
  console.log("scoredAt:", m.scoredAt);
  console.log("improvedAt:", m.improvedAt);
  console.log("summary:", m.scoreSummary);
  console.log("\nstrengths:", JSON.stringify(m.strengths, null, 2));
  console.log("\ngaps:", JSON.stringify(m.gaps, null, 2));
  console.log("\nchangeOrders:", JSON.stringify(m.changeOrders, null, 2));
  // end of chapter for context
  const t = sachbuchKapitelBodyText(k);
  console.log("\n===== END 900 =====\n", t.slice(-900));
  console.log("\n===== START 600 =====\n", t.slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
