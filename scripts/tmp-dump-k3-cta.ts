import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  const t = sachbuchKapitelBodyText(b!.kapitel[2]!);
  const i = t.indexOf("Quick-Start für die erste Woche");
  console.log("=== Quick-Start ===\n", t.slice(i, i + 2200));
  const j = t.indexOf("Sofort-Umsetzung");
  console.log("\n=== Sofort ===\n", t.slice(j - 300, j + 1200));
  // K1 start of CTA
  const t1 = sachbuchKapitelBodyText(b!.kapitel[0]!);
  const k = t1.indexOf("noch in dieser Woche mit drei");
  console.log("\n=== K1 CTA context ===\n", t1.slice(k - 250, k + 400));
  // K8 start
  const t8 = sachbuchKapitelBodyText(b!.kapitel[7]!);
  const m = t8.lastIndexOf("Erstens:");
  console.log("\n=== K8 last Erstens ===\n", t8.slice(m - 350, m + 200));
  // K9
  const t9 = sachbuchKapitelBodyText(b!.kapitel[8]!);
  const n = t9.indexOf("Machen Sie den kommenden Montag");
  console.log("\n=== K9 CTA ===\n", t9.slice(n - 400, n + 500));
}

main();
