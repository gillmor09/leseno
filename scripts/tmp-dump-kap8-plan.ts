import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const body = sachbuchKapitelBodyText(book!.kapitel[7]!);
  for (const lead of [
    "Schritt 1:",
    "Was Sie am Montag",
    "Montagmorgen",
    "Ihre nächsten",
    "Vier Schritte",
    "Drei Schritte",
    "Sofort umsetzen",
    "im nächsten Sprint",
    "Sechs-Fragen-Prozesskompass",
  ]) {
    const idx = body.lastIndexOf(lead);
    if (idx < 0) continue;
    console.log("\n===", lead, "idx", idx, "fromEnd", body.length - idx);
    console.log(body.slice(Math.max(0, idx - 300), idx + 400).replace(/\s+/g, " "));
  }
  // also find last 2000 chars structure by paragraph leads
  const paras = body.split(/\n\n+/);
  console.log("\n=== last 12 para leads ===");
  for (const p of paras.slice(-12)) {
    console.log("-", p.slice(0, 100).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
