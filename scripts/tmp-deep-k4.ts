import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[3]!;
  const m = k.manuscript;
  const t = sachbuchKapitelBodyText(k);

  console.log("title:", k.title);
  console.log("score:", m.salesScore);
  console.log("scoredAt:", m.scoredAt, "improvedAt:", m.improvedAt);
  console.log("summary:", m.scoreSummary);
  console.log("\ngaps:", JSON.stringify(m.gaps, null, 2));
  console.log("\norders:", JSON.stringify(m.changeOrders, null, 2));
  console.log("\nstrengths:", JSON.stringify(m.strengths, null, 2));
  writeFileSync("scripts/tmp-k4-body.txt", t, "utf8");

  const checks: Array<[string, RegExp]> = [
    ["VDP-Pyramide", /VDP-Pyramide/g],
    ["Value-Driven Privacy", /Value-Driven Privacy/g],
    ["Privacy Value Thinking", /Privacy Value Thinking/g],
    ["Kapitel N", /Kapitel\s+\d/gi],
    ["90-Tage-Verdichtung", /90-Tage-Verdichtung/g],
    ["Art./Artikel", /\bArt(?:ikel)?\.?\s*\d/gi],
    ["Markdown", /^#{1,3}\s|\*\*[^*]+\*\*/gm],
    ["Montag-CTA", /Montagmorgen|Montag-Mittwoch|noch in dieser Woche|kommender Montag/gi],
    ["Lektor-Meta", /noch nicht die|bilanzen wir|vorbehalten|hier geht es um|das war Kapitel|ist Kapitel|wie wir in|aus Kapitel/gi],
    ["Gemba Walk re-intro", /Gemba Walk|Im Lean Management existiert/gi],
    ["Just-in-Time", /Just-in-Time|Dummy-Daten|Dummy/gi],
  ];

  for (const [label, re] of checks) {
    const hits = [...t.matchAll(re)];
    if (!hits.length) continue;
    console.log(`\n=== ${label}: ${hits.length} ===`);
    for (const h of hits.slice(0, 10)) {
      const i = h.index ?? 0;
      console.log(JSON.stringify(t.slice(Math.max(0, i - 60), i + h[0].length + 100)));
    }
  }

  console.log("\n===== END 800 =====\n", t.slice(-800));
  console.log("\n===== START 500 =====\n", t.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
