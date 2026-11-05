/**
 * Extract prose around named tables for Gemini briefs.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const targets = [
    { ki: 0, re: /Tabelle\s*1\s*:/i },
    { ki: 3, re: /VDP-Übersetzungsmatrix|Tabelle:\s*Die VDP/i },
    { ki: 8, re: /Tabelle\s*9\.1\s*:/i },
    { ki: 8, re: /Tabelle\s*9\.2\s*:/i },
  ];
  for (const t of targets) {
    const plain = stripSachbuchLayoutMarkup(
      sachbuchKapitelExportBody(book.kapitel[t.ki]!),
    );
    const m = plain.match(t.re);
    if (!m || m.index == null) {
      console.log(`K${t.ki + 1}: NO MATCH ${t.re}`);
      continue;
    }
    console.log(`\n===== K${t.ki + 1} @${m.index} =====`);
    console.log(plain.slice(m.index, m.index + 1200).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
