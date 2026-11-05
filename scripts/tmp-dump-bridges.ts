/**
 * Dump last ~900 chars of Kap 4,6,7,8 for cliffhanger fix.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-bridges.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const KAPS = [4, 6, 7, 8];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const n of KAPS) {
    const k = book.kapitel[n - 1]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${n} ${k.title} ========`);
    console.log(t.slice(-1200));
  }
}

main();
