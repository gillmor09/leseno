/**
 * Dump Privacy Solution Canvas / Kompass / Feld 4 contexts.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[0]!;
  const plain = stripSachbuchLayoutMarkup(sachbuchKapitelExportBody(k));
  const h = k.manuscript.herstellungText;

  for (const re of [
    /Privacy Solution Canvas[\s\S]{0,800}/gi,
    /Prozesskompass[\s\S]{0,500}/gi,
    /Feld\s*4[\s\S]{0,600}/gi,
    /Rechtsgrundlage[\s\S]{0,300}/gi,
    /Risikomanagement[\s\S]{0,300}/gi,
  ]) {
    console.log("\n====", re.source.slice(0, 40), "====");
    const hits = [...plain.matchAll(re)].slice(0, 4);
    for (const m of hits) {
      console.log(m[0]!.replace(/\s+/g, " ").slice(0, 500));
      console.log("---");
    }
  }

  console.log("\n==== BOX onepager Canvas in Herstellung ====");
  const m = h.match(
    /<<<BOX[^>]*Privacy Solution Canvas[\s\S]*?<<<END BOX>>>/i,
  );
  if (m) console.log(m[0]!.slice(0, 2000));
  else {
    const m2 = h.match(/<<<BOX onepager[\s\S]*?Feld 4[\s\S]*?<<<END BOX>>>/i);
    console.log(m2?.[0]?.slice(0, 2500) ?? "no box");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
