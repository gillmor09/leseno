import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const BAD =
  /statt sie neu|Hier im Qualitätskapitel|meinen hier dasselbe|Kein neues Methodenkapitel|herangezogen haben|aus Kapitel \d|vorangegangenen Kapiteln|sagen dasselbe|übersetzen wir diese|die wir in diesem Buch bereits|bereits in Kapitel/gi;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 2; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits = [...body.matchAll(BAD)].map((m) => m[0]);
    console.log(`K${i + 1}: ${hits.length ? hits.join(" | ") : "clean"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
