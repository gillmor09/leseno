/**
 * Spot-check whether the 5 new book COs still have teeth in the prose.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Lean re-definitions after Kap2
  for (const n of [4, 5, 6]) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    const defs = [
      ...t.matchAll(
        /Poka-Yoke[^.!]{0,80}(bekannt|bedeutet|heißt|Prinzip greift|aus dem Lean|Lean Management)/gi,
      ),
      ...t.matchAll(
        /5S[^.!]{0,60}(Methode|bekannt|bedeutet|Ordnungssystem|aus der schlanken)/gi,
      ),
      ...t.matchAll(
        /Jidoka[^.!]{0,60}(bekannt|bedeutet|Fertigungsstraße|Reißleine)/gi,
      ),
    ];
    console.log(`K${n} lean-def-ish:`, defs.length);
    for (const m of defs.slice(0, 3)) {
      console.log(" ", t.slice(m.index! - 40, m.index! + 120).replace(/\s+/g, " "));
    }
  }

  // Dummy in K4
  const t4 = sachbuchKapitelBodyText(book.kapitel[3]!);
  console.log("\nK4 Dummy/Vergift:", [...t4.matchAll(/Dummy|Vergift|Wegwerf/gi)].map((m) => m[0]));

  // K5 90-Tage-Rollout
  const t5 = sachbuchKapitelBodyText(book.kapitel[4]!);
  console.log("K5 90-Tage-Rollout:", [...t5.matchAll(/90-Tage-Rollout/gi)].length);
  console.log("K5 Bereinigungsprojekt:", t5.includes("Bereinigungsprojekt"));

  // K9 pyramid length to RAG
  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  const rag = t9.indexOf("Noch während die große Trockenlegung");
  console.log("K9 words to RAG:", t9.slice(0, rag).trim().split(/\s+/).length);
  console.log("K9 short intro present:", t9.includes("Value-Driven Privacy übersetzt diese Haltung"));
}

main();
