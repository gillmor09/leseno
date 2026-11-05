/**
 * Find Poka-Yoke / 5S re-introductions after first mention.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-lean-reintros.ts
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  {
    id: "poka-define",
    re: /Poka-Yoke[^.!?\n]{0,40}(Prinzip|bekannt|bedeutet|heißt|nennt|steht für|Fehlervermeidung|aus dem Lean|Lean Management|wörtlich|übersetzt)/gi,
  },
  {
    id: "poka-reintro",
    re: /(bereits (bekannte|eingeführte|vertraute)|aus Kapitel|im Lean|bekannt als|nach dem (bekannten )?Poka-Yoke|Poka-Yoke-Prinzip[,:]?\s+(greift|sorgt|bedeutet|verhindert|etabliert))/gi,
  },
  {
    id: "5s-define",
    re: /5S[^.!?\n]{0,50}(Ordnungssystem|Methode|Prinzip|bekannt|bedeutet|heißt|Seiri|Sortieren|Lean)/gi,
  },
  {
    id: "5s-reintro",
    re: /(industrielle[sn]? 5S|5S-Gedanken|5S-Ordnung|nach dem 5S|aus Kapitel .{0,20}5S|bereits .{0,30}5S)/gi,
  },
  {
    id: "jidoka-muda",
    re: /(Jidoka|Muda)[^.!?\n]{0,60}(Prinzip|bekannt|bedeutet|heißt|Lean|Verschwendung)/gi,
  },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const report: Array<{
    kap: number;
    title: string;
    hits: Array<{ id: string; snip: string }>;
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const t = sachbuchKapitelBodyText(k);
    const hits: Array<{ id: string; snip: string }> = [];
    for (const p of PATTERNS) {
      const copy = new RegExp(p.re.source, p.re.flags);
      let m: RegExpExecArray | null;
      while ((m = copy.exec(t))) {
        hits.push({
          id: p.id,
          snip: t
            .slice(Math.max(0, m.index - 60), m.index + m[0].length + 180)
            .replace(/\s+/g, " ")
            .trim(),
        });
      }
    }
    report.push({ kap: i + 1, title: k.title, hits });
    console.log(`K${i + 1}: ${hits.length} hits`);
    for (const h of hits.slice(0, 8)) {
      console.log(`  [${h.id}] ${h.snip.slice(0, 200)}`);
    }
  }

  writeFileSync(
    "scripts/tmp-lean-reintros-report.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
}

main();
