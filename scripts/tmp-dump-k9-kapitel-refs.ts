import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[8]!);
  let from = 0;
  while (true) {
    const i = t.indexOf("Kapitel", from);
    if (i < 0) break;
    console.log(JSON.stringify(t.slice(Math.max(0, i - 60), i + 100)));
    from = i + 7;
  }
  const j = t.indexOf("VDP-Pyramide");
  console.log("\nVDP:", JSON.stringify(t.slice(j - 80, j + 120)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
