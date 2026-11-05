import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const orders = book.idee.manuscriptReview.changeOrders ?? [];
  writeFileSync(
    "scripts/tmp-4co-orders.json",
    JSON.stringify(orders, null, 2),
    "utf8",
  );
  console.log("wrote orders JSON, count", orders.length);
  if (orders[0]) console.log("keys", Object.keys(orders[0]));

  // excerpt around key phrases
  const excerpts: Array<{ kap: number; needle: string }> = [
    { kap: 3, needle: "90-Tage-Rollout aus Kapitel 9" },
    { kap: 3, needle: "bilanzen wir erst in Kapitel 9" },
    { kap: 5, needle: "90-Tage-Rollout aus Kapitel 9" },
    { kap: 5, needle: "folgt erst in Kapitel 9" },
    { kap: 5, needle: "bevor Kapitel 9" },
    { kap: 5, needle: "Governance aus Kapitel 3" },
    { kap: 5, needle: "in Kapitel 3 als operative" },
    { kap: 5, needle: "in Kapitel 3 eingeführten" },
    { kap: 6, needle: "Dass weniger Felder" },
    { kap: 6, needle: "Durchsatz-Gegner aus Kapitel 4" },
    { kap: 8, needle: "das war Kapitel 4" },
    { kap: 8, needle: "Vertrauensportal aus Kapitel 3" },
    { kap: 8, needle: "Bilanz in Kapitel 9" },
    { kap: 9, needle: "Sales Cycle Velocity" },
    { kap: 4, needle: "Gemba Walk" },
    { kap: 4, needle: "Verschwendungskategorien (Muda)" },
    { kap: 2, needle: "VDP-Pyramide geschlossen" },
    { kap: 7, needle: "tatslich" },
    { kap: 8, needle: "personenbezogenen Daten" },
    { kap: 8, needle: "Zusammenspiel aus Privacy Value Thinking" },
    { kap: 9, needle: "konsequenz" },
    { kap: 9, needle: "unzur" },
  ];

  for (const { kap, needle } of excerpts) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    const i = t.indexOf(needle);
    if (i < 0) {
      console.log(`\nMISS K${kap}: ${needle}`);
      // fuzzy
      if (needle.length > 8) {
        const soft = needle.slice(0, Math.min(12, needle.length));
        let from = 0;
        let found = 0;
        while (found < 3) {
          const j = t.indexOf(soft, from);
          if (j < 0) break;
          console.log("  near:", JSON.stringify(t.slice(Math.max(0, j - 40), j + 120)));
          from = j + soft.length;
          found++;
        }
      }
      continue;
    }
    console.log(`\nOK K${kap} [${needle}]:`);
    console.log(JSON.stringify(t.slice(Math.max(0, i - 80), i + needle.length + 200)));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
