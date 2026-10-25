/**
 * Locate Kap4/5 re-defs (Muda, ROT, Poka Yoke, Databerg) and Kap5 ConnectTel spots.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function hits(t: string, term: string, max = 6) {
  const out: { i: number; snip: string }[] = [];
  let i = 0;
  while ((i = t.indexOf(term, i)) >= 0 && out.length < max) {
    out.push({
      i,
      snip: t.slice(Math.max(0, i - 100), i + 220).replace(/\n/g, " / "),
    });
    i += term.length;
  }
  return out;
}

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");

  for (const idx of [3, 4]) {
    const t = b.kapitel[idx]!.manuscript.improvedText;
    console.log(`\n######## Kap${idx + 1} len=${t.length}`);
    for (const term of [
      "Muda",
      "Poka",
      "ROT",
      "Databerg",
      "ConnectTel",
      "Copilot",
      "Mittelstands-Abkürzung",
      "9-KPI",
      "Ihr Blatt für den Montagmorgen",
    ]) {
      const h = hits(t, term);
      console.log(`\n--- ${term} (${h.length}+) ---`);
      for (const x of h) console.log(`@${x.i}: ${x.snip}\n`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
