import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const t = sachbuchKapitelBodyText(book.kapitel[2]!);

  const markers = [
    "Dritte Kennzahl: Fehlerrate an den Pipeline-Toren",
    "38",
    "Befähigungsteam",
    "Quartal 3",
    "10:14",
    "VDP-Pyramide",
    "Kapitel drei bis sechs",
  ];

  for (const m of markers) {
    const i = t.indexOf(m);
    console.log(`\n######## ${m} @ ${i} ########`);
    if (i >= 0) console.log(t.slice(Math.max(0, i - 80), i + 900));
  }

  // Full third KPI + vorstand scenario - find a larger window from Dritte Kennzahl
  const start = t.indexOf("Dritte Kennzahl: Fehlerrate");
  const end = t.indexOf("\n\n", start + 2500);
  console.log("\n######## FULL BLOCK ########\n");
  console.log(t.slice(start, start + 3500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
