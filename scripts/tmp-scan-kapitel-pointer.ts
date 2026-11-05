/**
 * Find remaining "Kapitel N" pointers in Kap 3–9.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 2; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const re = /Kapitel \d|vorangegangenen Kapiteln|dieses Buches bereits|herangezogen|statt .{0,30}neu|meinen hier dasselbe|Kein neues Methoden/gi;
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    while ((m = copy.exec(body))) {
      const snip = body
        .slice(Math.max(0, m.index - 60), m.index + m[0].length + 100)
        .replace(/\s+/g, " ");
      console.log(`K${i + 1}: …${snip}…`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
