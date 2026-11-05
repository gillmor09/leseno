import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[8]!);
  let from = 0;
  while (true) {
    const i = t.search(/Kapitel\s+\d/i);
    // search from offset manually
    break;
  }
  from = 0;
  let c = 0;
  while (c < 40) {
    const i = t.indexOf("Kapitel", from);
    if (i < 0) break;
    console.log(JSON.stringify(t.slice(Math.max(0, i - 50), i + 90)));
    from = i + 7;
    c++;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
