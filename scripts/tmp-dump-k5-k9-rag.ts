import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const t5 = sachbuchKapitelBodyText(book!.kapitel[4]!);
  const t9 = sachbuchKapitelBodyText(book!.kapitel[8]!);

  const i5 = t5.indexOf("45.000");
  console.log("=== K5 around 45000 ===\n", t5.slice(Math.max(0, i5 - 200), i5 + 2500));

  const i9 = t9.indexOf("RAG-Assistenten");
  console.log("\n=== K9 RAG ===\n", t9.slice(Math.max(0, i9 - 300), i9 + 2200));

  // Kap1 foreshadow block
  const t1 = sachbuchKapitelBodyText(book!.kapitel[0]!);
  const j = t1.indexOf("Poka-Yoke-Prinzip, dessen technische Architektur");
  console.log("\n=== K1 Poka foreshadow ===\n", t1.slice(Math.max(0, j - 400), j + 900));
}

main();
