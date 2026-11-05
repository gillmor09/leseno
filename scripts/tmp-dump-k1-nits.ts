import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[0]!);

  const patterns: Array<[string, RegExp]> = [
    ["VDP-Pyramide", /VDP-Pyramide/g],
    ["Value-Driven Privacy", /Value-Driven Privacy/g],
    ["Privacy Value Thinking", /Privacy Value Thinking/g],
    ["Kapitel N", /Kapitel\s+\d/g],
    ["Art./Artikel", /\bArt(?:ikel)?\.?\s*\d/g],
    ["Markdown #", /^#{1,3}\s/gm],
    ["**bold**", /\*\*[^*]+\*\*/g],
    ["Montag/CTA", /Montag|noch in dieser Woche|90-Tage-Sprint|Sofortprogramm/gi],
    ["90-Tage-Verdichtung", /90-Tage-Verdichtung/g],
  ];

  for (const [label, re] of patterns) {
    const hits = [...t.matchAll(re)];
    console.log(`\n${label}: ${hits.length}`);
    for (const m of hits.slice(0, 6)) {
      const i = m.index ?? 0;
      console.log(" ", JSON.stringify(t.slice(Math.max(0, i - 50), i + m[0].length + 70)));
    }
  }

  // VDP vs PVT near end
  const i = t.indexOf("VDP-Pyramide");
  if (i >= 0) console.log("\nVDP context:", JSON.stringify(t.slice(i - 100, i + 200)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
