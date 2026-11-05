/**
 * Find Monday-morning plans / cheap advisor checklists in the Sachbuch.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "montagmorgen", re: /Montagmorgen|Montag morgen|am Montagmorgen|Montagmorgen-Plan|Montagplan/gi },
  { id: "diese woche", re: /noch (in )?dieser Woche|Starten Sie (noch )?heute|Beginnen Sie (noch )?heute|Als Erstes (sollten|können) Sie/gi },
  { id: "tage 1", re: /Tage 1\s*(bis|-|–)\s*30|Tag 1\s*(bis|-|–)|90-Tage-Plan|in den nächsten (7|14|30) Tagen/gi },
  { id: "checkliste", re: /Checkliste|Aktionsplan|Handlungsplan|Sofortmaßnahmen|Ihre nächsten Schritte|Nächste Schritte:|Was Sie jetzt tun/gi },
  { id: "erstens starten", re: /Erstens:\s*Starten|Zweitens:\s*|Drittens:\s*|Tun Sie Folgendes|Machen Sie Folgendes/gi },
  { id: "nehmen sie", re: /Nehmen Sie sich|Blocken Sie|Setzen Sie sich (noch )?heute|Schreiben Sie (noch )?heute/gi },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{
    kap: number;
    title: string;
    hits: Array<{ id: string; snip: string }>;
    headings: string[];
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const body = sachbuchKapitelBodyText(k);
    const hits: Array<{ id: string; snip: string }> = [];
    for (const p of PATTERNS) {
      const copy = new RegExp(p.re.source, p.re.flags);
      let m: RegExpExecArray | null;
      while ((m = copy.exec(body))) {
        hits.push({
          id: p.id,
          snip: body
            .slice(Math.max(0, m.index - 80), m.index + m[0].length + 160)
            .replace(/\s+/g, " ")
            .trim(),
        });
      }
    }
    const headings = [...body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1]!.trim());
    const planHeadings = headings.filter((h) =>
      /Montag|Plan|Checkliste|Schritte|Sofort|Aktions|90.?Tage|Rollout|Übung|Praxisauftrag|Hausaufgabe/i.test(
        h,
      ),
    );
    out.push({
      kap: i + 1,
      title: k.title,
      hits,
      headings: planHeadings,
    });
  }

  writeFileSync("scripts/tmp-montagmorgen-report.json", JSON.stringify(out, null, 2), "utf8");
  for (const row of out) {
    console.log(
      `K${row.kap}: ${row.hits.length} hits, plan-headings=${row.headings.join(" | ") || "—"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
