import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const plain = stripSachbuchLayoutMarkup(sachbuchKapitelExportBody(k));
    const lines = plain.split(/\n/);
    let hit = false;
    for (let li = 0; li < lines.length; li++) {
      if (!/Abbildung\s*[\d.]/i.test(lines[li]!)) continue;
      if (!hit) {
        console.log(`\n==== K${i + 1} ${k.title} ====`);
        hit = true;
      }
      const chunk = [lines[li]!, lines[li + 1] ?? "", lines[li + 2] ?? ""]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      console.log(chunk);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
