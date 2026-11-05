import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const orders = book.idee.manuscriptReview.changeOrders ?? [];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    console.log(`\n===== ORDER ${i} typeof=${typeof o} =====`);
    if (typeof o === "string") console.log(o.slice(0, 1200));
    else console.log(JSON.stringify(o, null, 2).slice(0, 1200));
  }

  const t3 = sachbuchKapitelBodyText(book.kapitel[2]!);
  for (const n of ["Sales", "Wochen → Stunden", "zwölf Tage", "Nachweis-Hebel", "Governance"]) {
    let from = 0;
    let c = 0;
    while (c < 4) {
      const j = t3.indexOf(n, from);
      if (j < 0) break;
      console.log(`\nK3[${n}@${j}]:`, JSON.stringify(t3.slice(Math.max(0, j - 100), j + 220)));
      from = j + n.length;
      c++;
    }
  }

  // typo hunt K7/K9
  for (const kap of [7, 9]) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    const bad = t.match(/\b\w*(tatslich|konsequenzten|unzurenden|Verarbeitung personenbezogenen)\w*\b/gi);
    console.log(`\nK${kap} bad words:`, bad);
    // also scan review order mentions
  }

  // K9 sales paragraph full
  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  const i = t9.indexOf("Sales Cycle Velocity");
  console.log("\nK9 velocity para:", JSON.stringify(t9.slice(i - 80, i + 550)));
  const j = t9.indexOf("Komplexe B2B-Freigaben");
  if (j >= 0) console.log("\nK9 freigaben:", JSON.stringify(t9.slice(j, j + 400)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
