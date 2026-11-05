/**
 * Extract definitional paragraphs that re-introduce glossary/studies.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-extract-intros.ts
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const DEF = /übersetzt so viel|entwickelt(e|en) Konzept|japanisch für|Ursprünglich in der japanischen|physischen Produktionsbetrieb|Shigeo Shingo|Toyota-Produktionssystems|hineingeprüft|Baymard Institute|Cisco Privacy|Cisco-Studie|1,6-?fach|1,6x|Gartner.{0,80}Dark Data|Dark Data.{0,80}Gartner|1-10-100|1–10–100|Auskunftskosten|DataGrail|Deming|Andon-Leine|fünf S |Seiri|Sortieren \(Seiri\)/i;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{ kap: number; paras: string[] }> = [];
  book.kapitel.forEach((k, i) => {
    const body = sachbuchKapitelBodyText(k);
    const paras = body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 80 && DEF.test(p));
    out.push({ kap: i + 1, paras });
  });
  writeFileSync(
    "scripts/tmp-intro-paras.json",
    JSON.stringify(
      out.map((o) => ({
        kap: o.kap,
        n: o.paras.length,
        paras: o.paras.map((p) => p.slice(0, 700)),
      })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(out.map((o) => `K${o.kap}: ${o.paras.length} Def-Absätze`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
