/**
 * Scan manuscript for book-wide first-intro redundancies.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-redundanz.ts
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const TERMS: Array<{ id: string; re: RegExp }> = [
  { id: "poka-yoke", re: /poka[-\s]?yoke/gi },
  { id: "jidoka", re: /jidoka/gi },
  { id: "5s", re: /\b5S\b|Fünf-S|5-S-Methode/gi },
  { id: "1-10-100", re: /1[–\-‑]10[–\-‑]100|1.10.100|eins-zehn-hundert/gi },
  { id: "deming", re: /Deming|Qualitäts-Postulat|Qualität kann nicht.*hineingeprüft/gi },
  { id: "baymard", re: /Baymard|70\s*%.*Abbruch|Warenkorbabbruch/gi },
  { id: "cisco", re: /Cisco|1[,.]6\s*[x×]|ROI.*1[,.]6/gi },
  { id: "gartner", re: /Gartner|Dark Data/gi },
  { id: "datagrail", re: /DataGrail|Auskunftskosten|1\.500|1500\s*(Dollar|USD|Euro)/gi },
];

function snippets(text: string, re: RegExp, max = 6): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = copy.exec(text)) && out.length < max) {
    const start = Math.max(0, m.index - 160);
    const end = Math.min(text.length, m.index + m[0].length + 220);
    out.push(text.slice(start, end).replace(/\s+/g, " ").trim());
  }
  return out;
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const report: Record<string, Array<{ kap: number; title: string; n: number; hits: string[] }>> =
    {};
  for (const t of TERMS) report[t.id] = [];

  book.kapitel.forEach((k, i) => {
    const body = sachbuchKapitelBodyText(k);
    for (const t of TERMS) {
      const hits = snippets(body, t.re);
      const n = (body.match(new RegExp(t.re.source, t.re.flags)) ?? []).length;
      if (n > 0) {
        report[t.id]!.push({
          kap: i + 1,
          title: k.title,
          n,
          hits,
        });
      }
    }
  });

  writeFileSync(
    "scripts/tmp-redundanz-report.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(
    Object.entries(report)
      .map(
        ([id, rows]) =>
          `${id}: ${rows.map((r) => `K${r.kap}×${r.n}`).join(", ") || "—"}`,
      )
      .join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
