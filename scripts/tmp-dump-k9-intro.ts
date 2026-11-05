/**
 * Dump Kap 9 opening until RAG incident for pyramid-summary cut.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-k9-intro.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const t = sachbuchKapitelBodyText(book!.kapitel[8]!);
  const rag = t.search(/RAG-Assistenten|Beinahe|Ticket-Archiv|Noch während die große Trockenlegung/);
  console.log("RAG marker index:", rag);
  console.log("\n===== OPENING → RAG =====\n");
  console.log(t.slice(0, rag > 0 ? rag + 400 : 6000));
  console.log("\n===== word count opening =====");
  const opening = t.slice(0, rag > 0 ? rag : 5000);
  console.log(opening.trim().split(/\s+/).length);
}

main();
