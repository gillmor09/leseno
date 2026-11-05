/**
 * Find Fundament / Motor / Pyramide architecture claims across chapters.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const RE =
  /Fundament|methodischen Motor|operativen Motor|Motor der Pyramide|Qualitäts-Pyramide|erste Ebene|zweite Ebene|Teil [ABC]|Kapitel [2-6]|Folgekapitel|nun (sei|ist) das Fundament|Fundament .{0,40}(fertig|errichtet|steht)|Motor .{0,40}(start|begin|wechselt)|Werkshalle|Pyramide/gi;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{ kap: number; title: string; hits: string[] }> = [];

  for (let i = 0; i < Math.min(6, book.kapitel.length); i += 1) {
    const k = book.kapitel[i]!;
    const body = sachbuchKapitelBodyText(k);
    const hits: string[] = [];
    const copy = new RegExp(RE.source, RE.flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(body))) {
      const idx = m.index;
      hits.push(
        body
          .slice(Math.max(0, idx - 120), idx + m[0].length + 200)
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
    // also dump last 2 paras for kap 1-4
    out.push({ kap: i + 1, title: k.title, hits });
    console.log(`K${i + 1}: ${hits.length} hits`);
  }

  writeFileSync("scripts/tmp-pyramid-arch.json", JSON.stringify(out, null, 2), "utf8");

  // endings of 1-4
  for (let i = 0; i < 4; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const paras = body.split(/\n\n+/).filter(Boolean);
    console.log(`\n=== K${i + 1} last 2 ===`);
    for (const p of paras.slice(-2)) {
      console.log(p.slice(0, 500).replace(/\s+/g, " "));
      console.log("---");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
