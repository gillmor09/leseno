import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[6]!;
  const t = sachbuchKapitelBodyText(k);

  // stored prior COs may still be in draft scoring history - check any leftover in DB fields
  console.log("stored orders (may be empty):", k.manuscript.changeOrders);

  for (const n of [
    "Lässt sich der betriebliche Grund",
    "in einem oder zwei klaren",
    "Schichtenmodell",
    "Als die KlarNetz AG im Rahmen",
    "Heizungssteuerung",
    "Postleitzahlen",
    "Router-Stabilität",
    "KlarHome",
    "Kapitel 9",
    "Sales Velocity",
    "wie wir in den vorangegangenen",
    "Laufender Betrieb",
    "Behörden-Audit",
    "Empirische UX-Tests",
    "Design-System",
    "Privacy Solution Canvas",
  ]) {
    let from = 0;
    let c = 0;
    while (c < 5) {
      const i = t.indexOf(n, from);
      if (i < 0) break;
      console.log(`\n[${n}@${i}]`, JSON.stringify(t.slice(Math.max(0, i - 80), i + 320)));
      from = i + n.length;
      c++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
