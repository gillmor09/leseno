/**
 * Extract paragraphs with study/stat echoes (Kap 2–9).
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const HIT =
  /Cisco|Gartner|Baymard|DataGrail|Dark Data|1[,.]6-|1[,.]60|1\.400|1\.500 US|IDC zum Phänomen/i;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{ kap: number; paras: string[] }> = [];
  for (let i = 1; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const paras = body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => HIT.test(p));
    out.push({ kap: i + 1, paras });
    console.log(`K${i + 1}: ${paras.length}`);
  }
  writeFileSync("scripts/tmp-study-paras.json", JSON.stringify(out, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
