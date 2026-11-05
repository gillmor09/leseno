/**
 * Map Cisco / Gartner / Baymard / DataGrail / ROI study echoes per chapter.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const TERMS: Array<{ id: string; re: RegExp }> = [
  { id: "cisco", re: /Cisco/gi },
  { id: "gartner", re: /Gartner/gi },
  { id: "baymard", re: /Baymard/gi },
  { id: "datagrail", re: /DataGrail/gi },
  { id: "dark-data", re: /Dark Data/gi },
  { id: "roi-1.6", re: /1[,.]6\s*[–\-x×]|1[,.]60|1[,.]8\s*[–\-x×]|2-Fachen|2-fachen/gi },
  { id: "1400", re: /1[.,]?400|eintausendvierhundert|über tausend Euro|1\.500 US/gi },
  { id: "70-abbruch", re: /siebzig Prozent|70\s*%|Warenkorb.{0,40}Abbruch|Abbruchquote von/gi },
  { id: "b2b-wochen", re: /drei bis fünf Wochen|5[,.]4 Wochen|16 Wochen|Verzögerung.{0,30}Vertrieb|B2B.{0,40}Wochen/gi },
  { id: "75-vertrauen", re: /75 Prozent.{0,80}(misstrauen|Vertrauen|kaufen)|nicht bei Unternehmen kaufen/gi },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const report: Record<
    string,
    Array<{ kap: number; title: string; n: number; snips: string[] }>
  > = {};
  for (const t of TERMS) report[t.id] = [];

  book.kapitel.forEach((k, i) => {
    const body = sachbuchKapitelBodyText(k);
    for (const t of TERMS) {
      const matches = [...body.matchAll(new RegExp(t.re.source, t.re.flags))];
      if (!matches.length) continue;
      const snips = matches.slice(0, 4).map((m) => {
        const idx = m.index ?? 0;
        return body
          .slice(Math.max(0, idx - 100), idx + m[0].length + 160)
          .replace(/\s+/g, " ")
          .trim();
      });
      report[t.id]!.push({
        kap: i + 1,
        title: k.title,
        n: matches.length,
        snips,
      });
    }
  });

  writeFileSync(
    "scripts/tmp-study-echo-report.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
  for (const [id, rows] of Object.entries(report)) {
    console.log(
      `${id}: ${rows.map((r) => `K${r.kap}×${r.n}`).join(", ") || "—"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
