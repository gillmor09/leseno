import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[6]!;
  for (const [label, t] of [
    ["body", sachbuchKapitelBodyText(k)],
    ["improved", k.manuscript.improvedText ?? ""],
    ["draft", k.manuscript.draftText ?? ""],
  ] as const) {
    console.log(`\n=== ${label} ===`);
    for (const n of ["Datenverkehr", "tatslich", "tatsächlichen Datenverkehr", "Datenfluss-Inventar"]) {
      const i = t.indexOf(n);
      console.log(n, i);
      if (i >= 0) console.log(JSON.stringify(t.slice(i - 60, i + 100)));
    }
  }

  // K8 personenbezogen*
  const t8 = sachbuchKapitelBodyText(book.kapitel[7]!);
  let from = 0;
  while (true) {
    const i = t8.indexOf("personenbezogen", from);
    if (i < 0) break;
    console.log("K8 personenbezogen:", JSON.stringify(t8.slice(i - 40, i + 50)));
    from = i + 10;
  }

  // K2 VDP-Pyramide all
  const t2 = sachbuchKapitelBodyText(book.kapitel[1]!);
  from = 0;
  while (true) {
    const i = t2.indexOf("VDP-Pyramide", from);
    if (i < 0) break;
    console.log("K2 VDP:", JSON.stringify(t2.slice(i - 80, i + 120)));
    from = i + 10;
  }

  // K8 dopplung sentence
  const i = t8.indexOf("Sicherheits- und Datenschutzprüfungen zur Sicherheit");
  console.log("\nK8 dopplung:", JSON.stringify(t8.slice(i - 40, i + 200)));

  // K5 5S method re-intro full sentences for CO3
  const t5 = sachbuchKapitelBodyText(book.kapitel[4]!);
  const a = t5.indexOf("5S-Methode als operatives Betriebssystem");
  console.log("\nK5 5S intro:", JSON.stringify(t5.slice(a - 120, a + 200)));
  const b = t5.indexOf("5S-Methode verankert");
  console.log("\nK5 5S step5:", JSON.stringify(t5.slice(b - 80, b + 200)));

  // K6 lean intro
  const t6 = sachbuchKapitelBodyText(book.kapitel[5]!);
  const c = t6.indexOf("Im klassischen Produktions- und Lean-Management");
  console.log("\nK6 lean:", JSON.stringify(t6.slice(c - 80, c + 250)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
