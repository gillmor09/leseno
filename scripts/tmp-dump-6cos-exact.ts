import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);

  const t2 = sachbuchKapitelBodyText(book!.kapitel[1]!);
  console.log("=== K2 pyramid mentions ===");
  for (const m of t2.matchAll(/Pyramide[^\n.]{0,120}/gi)) {
    console.log("·", m[0]);
  }
  console.log("\n=== K2 last 900 chars ===\n", t2.slice(-900));

  const t3 = sachbuchKapitelBodyText(book!.kapitel[2]!);
  const i3 = t3.indexOf("vierstufigen Transformationspfad");
  console.log("\n=== K3 roadmap intro ===\n", t3.slice(i3 - 200, i3 + 450));

  const t5 = sachbuchKapitelBodyText(book!.kapitel[4]!);
  const i5 = t5.indexOf("Die dreistufige Architektur-Bereinigung");
  console.log("\n=== K5 bereinigung intro ===\n", t5.slice(i5, i5 + 900));
  const i5b = t5.indexOf("initiales Bereinigungsprojekt");
  console.log("\n=== K5 initiales ===\n", t5.slice(Math.max(0, i5b - 150), i5b + 400));

  const t8 = sachbuchKapitelBodyText(book!.kapitel[7]!);
  console.log("\n=== K8 personenbezogen* ===");
  for (const m of t8.matchAll(/personenbezogen\w* Daten[^\n.]{0,40}/gi)) {
    console.log("·", m[0]);
  }
  for (const m of t8.matchAll(/Verarbeitung personenbezogen[^\n.]{0,40}/gi)) {
    console.log("·", m[0]);
  }

  const t6 = sachbuchKapitelBodyText(book!.kapitel[5]!);
  console.log("\n=== K6 Fehlzustellung paras ===");
  let from = 0;
  let n = 0;
  while (n < 4) {
    const i = t6.indexOf("Fehlzustellung", from);
    if (i < 0) break;
    n += 1;
    console.log(`\n#${n}`, t6.slice(Math.max(0, i - 120), i + 200).replace(/\s+/g, " "));
    from = i + 1;
  }

  const t9 = sachbuchKapitelBodyText(book!.kapitel[8]!);
  for (const needle of [
    "Sales Cycle Velocity",
    "halbierte sich die Bearbeitungszeit",
    "54 Prozent",
    "wenige Stunden",
  ]) {
    const i = t9.indexOf(needle);
    console.log(`\n=== K9 ${needle} ===`);
    if (i < 0) console.log("NOT FOUND");
    else console.log(t9.slice(i - 80, i + 350).replace(/\s+/g, " "));
  }
}

main();
