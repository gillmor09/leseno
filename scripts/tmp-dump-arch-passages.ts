import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NEEDLES: Record<number, string[]> = {
  1: [
    "methodischen Motor",
    "mittlere Ebene",
    "Fundament",
    "Kapitel 2",
    "Kapitel 1",
    "Pyramide",
    "Teil A",
    "Teil B",
  ],
  2: [
    "Fundament",
    "Motor",
    "Pyramide",
    "nächsten Kapitel",
    "Werkshalle",
    "Mit dieser nahtlosen",
    "Wer den Schutz",
  ],
  3: [
    "Fundament",
    "Motor",
    "Pyramide",
    "nächsten",
    "Mit diesem ersten",
    "Audit by Design",
  ],
  4: ["Motor", "Fundament", "Pyramide", "mittlere Ebene"],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Record<string, Array<{ needle: string; snip: string }>> = {};

  for (const [kapStr, needles] of Object.entries(NEEDLES)) {
    const kap = Number(kapStr);
    const body = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    out[`K${kap}`] = [];
    for (const n of needles) {
      let from = 0;
      let c = 0;
      while (c < 3) {
        const idx = body.indexOf(n, from);
        if (idx < 0) break;
        out[`K${kap}`]!.push({
          needle: n,
          snip: body.slice(Math.max(0, idx - 80), idx + 280).replace(/\s+/g, " "),
        });
        from = idx + n.length;
        c += 1;
      }
    }
    const paras = body.split(/\n\n+/).filter(Boolean);
    console.log(`\n##### K${kap} LAST PARA #####`);
    console.log(paras.at(-1)?.slice(0, 900));
    if (paras.length > 1) {
      console.log(`\n##### K${kap} SECOND LAST #####`);
      console.log(paras.at(-2)?.slice(0, 500));
    }
  }

  writeFileSync("scripts/tmp-arch-passages.json", JSON.stringify(out, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
