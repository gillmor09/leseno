import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  for (const i of [0, 3]) {
    const t = b.kapitel[i]!.manuscript.improvedText;
    const idx = t.indexOf("Ihr Blatt für den Montagmorgen");
    console.log(`===K${i + 1} Montag===`);
    console.log(idx < 0 ? "NOT FOUND" : t.slice(idx, idx + 1100));
    console.log("");
  }
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  for (const term of [
    "Auskunft",
    "Muda",
    "Berechtig",
    "Subject Access",
    "Access Review",
    "Operational",
  ]) {
    let i = 0;
    let c = 0;
    while ((i = t4.indexOf(term, i)) >= 0 && c < 4) {
      console.log(
        `K4 ${term}:`,
        t4.slice(Math.max(0, i - 60), i + 100).replace(/\s+/g, " "),
      );
      i++;
      c++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
