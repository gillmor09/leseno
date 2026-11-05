import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const body = sachbuchKapitelBodyText(book!.kapitel[0]!);
  const idx = body.indexOf("Schritt 1: Beweislast");
  console.log("idx", idx, "len", body.length, "fromEnd", body.length - idx);
  console.log(body.slice(Math.max(0, idx - 250), idx + 1200).replace(/\s+/g, " "));
  // also list Schritt N
  for (const m of body.matchAll(/Schritt \d:[^\n]{0,80}/g)) {
    console.log("•", m[0]);
  }
}

main().catch(console.error);
