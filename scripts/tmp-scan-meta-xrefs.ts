/**
 * Find wooden meta cross-refs / dedupe-prompt artifacts in Kap. 5–9.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "statt neu", re: /statt (sie |ihn |es )?(neu )?(herzuleiten|einzuführen|zu erklären|zu wiederholen)/gi },
  { id: "nicht erneut", re: /nicht (als )?(erneute|neue) (Werksführung|Methodenlektion|Studienlektion|Methodenkapitel)/gi },
  { id: "wenden an", re: /wenden wir .{0,60}(an|an,)/gi },
  { id: "meinen dasselbe", re: /meinen hier dasselbe|sagen dasselbe|gilt hier unverändert|gelten unverändert/gi },
  { id: "dasselbe X aus", re: /dasselbe .{0,40} aus Kapitel \d|denselben .{0,50} aus Kapitel \d|dieselbe .{0,40} aus Kapitel \d|dieselben .{0,50} aus Kapitel \d/gi },
  { id: "bereits in Kap", re: /bereits in Kapitel \d|aus Kapitel \d|die wir in diesem Buch bereits|an anderer Stelle dieses Buches/gi },
  { id: "kein neues", re: /Kein neues Methodenkapitel|nicht als erneute|statt sie neu|hier wenden wir|hier im Qualitätskapitel|jetzt als Betriebssystem/gi },
  { id: "herangezogen", re: /herangezogen haben|herangezogen,|bereits .+ herangezogen/gi },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{ kap: number; title: string; hits: Array<{ id: string; snip: string }> }> = [];

  for (let i = 4; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const body = sachbuchKapitelBodyText(k);
    const hits: Array<{ id: string; snip: string }> = [];
    for (const p of PATTERNS) {
      const copy = new RegExp(p.re.source, p.re.flags);
      let m: RegExpExecArray | null;
      while ((m = copy.exec(body))) {
        const start = Math.max(0, m.index - 100);
        const end = Math.min(body.length, m.index + m[0].length + 180);
        hits.push({
          id: p.id,
          snip: body.slice(start, end).replace(/\s+/g, " ").trim(),
        });
      }
    }
    out.push({ kap: i + 1, title: k.title, hits });
  }

  writeFileSync("scripts/tmp-meta-xrefs.json", JSON.stringify(out, null, 2), "utf8");
  for (const row of out) {
    console.log(`K${row.kap} (${row.title}): ${row.hits.length} hits`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
