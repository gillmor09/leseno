import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[2]!;
  const m = k.manuscript;
  const t = sachbuchKapitelBodyText(k);

  console.log("title:", k.title);
  console.log("score:", m.salesScore);
  console.log("scoredAt:", m.scoredAt, "improvedAt:", m.improvedAt);
  console.log("summary:", m.scoreSummary);
  console.log("\ngaps:", JSON.stringify(m.gaps, null, 2));
  console.log("\norders:", JSON.stringify(m.changeOrders, null, 2));
  console.log("\nstrengths:", JSON.stringify(m.strengths, null, 2));

  writeFileSync("scripts/tmp-k3-body.txt", t, "utf8");

  const checks: Array<[string, RegExp]> = [
    ["VDP-Pyramide", /VDP-Pyramide/g],
    ["Value-Driven Privacy", /Value-Driven Privacy/g],
    ["Privacy Value Thinking", /Privacy Value Thinking/g],
    ["Kapitel N", /Kapitel\s+\d/g],
    ["90-Tage-Verdichtung", /90-Tage-Verdichtung/g],
    ["Art./Artikel", /\bArt(?:ikel)?\.?\s*\d/gi],
    ["Markdown heading", /^#{1,3}\s/gm],
    ["**bold**", /\*\*[^*]+\*\*/g],
    ["Montag-CTA", /Montagmorgen|Montag-Mittwoch|noch in dieser Woche|kommender Montag/gi],
    ["meta paren Kapitel", /\([^)]{0,80}Kapitel[^)]{0,80}\)/gi],
    ["Lektor-Meta", /noch nicht die|bilanzen wir|vorbehalten|hier geht es um|das war Kapitel|ist Kapitel/gi],
    ["Tippfehler-Kandidaten", /\b\w*(tatslich|konsequenzten|unzurenden|Abbsatz|personenbezogenen Daten fällt)\w*\b/gi],
  ];

  for (const [label, re] of checks) {
    const hits = [...t.matchAll(re)];
    if (!hits.length) continue;
    console.log(`\n=== ${label}: ${hits.length} ===`);
    for (const h of hits.slice(0, 8)) {
      const i = h.index ?? 0;
      console.log(JSON.stringify(t.slice(Math.max(0, i - 70), i + h[0].length + 90)));
    }
  }

  // Chronology / 38% portal issue from earlier CO
  for (const n of ["38 %", "38%", "Fehlerrate", "Kundenportal", "10:14", "Befähigungsteam", "Design Pattern"]) {
    let from = 0;
    let c = 0;
    while (c < 2) {
      const i = t.indexOf(n, from);
      if (i < 0) break;
      console.log(`\n[${n}@${i}]`, JSON.stringify(t.slice(Math.max(0, i - 100), i + 220)));
      from = i + n.length;
      c++;
    }
  }

  console.log("\n===== END 700 =====\n", t.slice(-700));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
