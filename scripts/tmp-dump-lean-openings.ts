import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const kap of [4, 5, 6, 7, 9]) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    console.log(`\n######## K${kap} FIRST 900 ########`);
    console.log(t.slice(0, 900));
  }

  // Jidoka intros
  for (const kap of [4, 5, 6, 7, 9]) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    let from = 0;
    let c = 0;
    while (c < 2) {
      const i = t.indexOf("Jidoka", from);
      if (i < 0) break;
      console.log(`K${kap} Jidoka:`, JSON.stringify(t.slice(Math.max(0, i - 60), i + 160)));
      from = i + 6;
      c++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
