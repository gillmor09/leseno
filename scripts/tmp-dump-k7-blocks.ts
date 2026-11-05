import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[6]!);

  const starts = [
    t.indexOf("Gutes Information Design wirkt hier wie ein unbestechlicher"),
    t.indexOf("Lässt sich der betriebliche Grund"),
    t.indexOf("Als die KlarNetz AG im Rahmen der Einführung ihrer vernetzten Heimtarife"),
    t.indexOf("er speist später die Sales Velocity"),
    t.indexOf("wie wir in den vorangegangenen Kapiteln"),
    t.indexOf("Dient ein geplanter Datenfluss rein internen Zwecken"),
  ];
  for (const i of starts) {
    console.log("\n######## @" + i + " ########\n");
    console.log(t.slice(Math.max(0, i - 40), i + 900));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
