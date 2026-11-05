import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  console.log("orders:", book.idee.manuscriptReview.changeOrders?.length ?? 0);
  for (const o of book.idee.manuscriptReview.changeOrders ?? []) {
    console.log("\n---", o.id, o.title);
    console.log(o.instruction?.slice(0, 500));
  }
  const needles = [
    "90-Tage-Rollout aus Kapitel 9",
    "bilanzen wir erst in Kapitel 9",
    "folgt erst in Kapitel 9",
    "bevor Kapitel 9",
    "Governance aus Kapitel 3",
    "Dass weniger Felder",
    "das war Kapitel 4",
    "Bilanz in Kapitel 9",
    "Sales Cycle Velocity",
    "Gemba Walk",
    "Verschwendungskategorien (Muda)",
    "VDP-Pyramide geschlossen",
    "tatslichen",
    "personenbezogenen Daten",
    "Zusammenspiel aus Privacy Value Thinking",
    "konsequenzten",
    "unzurenden",
    "Kapiteln",
  ];
  for (let i = 0; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits = needles.filter((n) => t.includes(n));
    if (hits.length) console.log(`\nK${i + 1} hits:`, hits.join(" | "));
  }
  // dump meta-ish parens in K3/5/6/8
  for (const n of [3, 5, 6, 8]) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    console.log(`\n===== K${n} META CANDIDATES =====`);
    for (const m of t.matchAll(/\([^)]{10,280}\)/g)) {
      if (/Kapitel|Durchsatz|Felder|Sales|Wochen/i.test(m[0])) console.log(m[0]);
    }
    for (const m of t.matchAll(/[^.!?\n]{0,40}Kapitel \d[^.!?\n]{0,120}/g)) {
      console.log("SENT:", m[0].trim());
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
