import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const needles = [
  "noch nicht die Sales-Velocity der späteren unternehmensweiten 90-Tage-Verdichtung",
  "nicht die Kennzahl der unternehmensweiten 90-Tage-Verdichtung",
  "messbare Gesamt-Sales-Velocity der unternehmensweiten 90-Tage-Verdichtung",
  "Sales Cycle Velocity der 90-Tage-Verdichtung",
  "90-Tage-Verdichtung",
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const n of [3, 5, 8, 9]) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    console.log(`\n===== K${n} =====`);
    for (const needle of needles) {
      const i = t.indexOf(needle);
      if (i < 0) continue;
      console.log("\nHIT:", needle);
      console.log(JSON.stringify(t.slice(Math.max(0, i - 120), i + needle.length + 160)));
    }
  }
  console.log("\nbook orders:", book.idee.manuscriptReview.changeOrders);
  for (const k of [3, 5, 8, 9].map((n) => book.kapitel[n - 1]!)) {
    if (k.manuscript.changeOrders.length) {
      console.log(`\n${k.title} COs:`, k.manuscript.changeOrders);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
