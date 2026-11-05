import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const body = sachbuchKapitelBodyText(book!.kapitel[8]!);
  const paras = body.split(/\n\n+/).filter(Boolean);
  for (const p of paras.slice(-4)) {
    console.log("---");
    console.log(p.slice(0, 600));
  }
}

main().catch(console.error);
