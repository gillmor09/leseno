import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const ANCHORS: Array<{ kap: number; needle: string }> = [
  { kap: 1, needle: "methodische Gegenstück zur Datenrichtigkeit" },
  { kap: 4, needle: "Baymard Institute im E-Commerce" },
  { kap: 6, needle: "Branchenanalysen von Gartner mit durchschnittlich" },
  { kap: 6, needle: "1-10-100-Regel ihre volle" },
  { kap: 6, needle: "DataGrail oder Gartner" },
  { kap: 6, needle: "Prävention an der Schnittstelle" },
  { kap: 6, needle: "präventives Poka-Yoke-Design" },
  { kap: 7, needle: "Cisco Consumer Privacy Survey" },
  { kap: 7, needle: "Baymard Institute zeigen" },
  { kap: 7, needle: "1-10-100-Regel der Qualitätskosten" },
  { kap: 7, needle: "Erhebungen von Gartner deckt" },
  { kap: 7, needle: "Fehlersicherung nach dem Poka-Yoke" },
  { kap: 7, needle: "sorgt unser Poka-Yoke-Prinzip" },
  { kap: 9, needle: "RAG-Assistenten für die Support" },
  { kap: 9, needle: "unzureichend isoliertes Ticket-Archiv" },
  { kap: 9, needle: "Marktdaten von Gartner belegen" },
  { kap: 9, needle: "Benchmark-Daten von Cisco" },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Record<string, string> = {};
  for (const a of ANCHORS) {
    const t = sachbuchKapitelBodyText(book.kapitel[a.kap - 1]!);
    const i = t.indexOf(a.needle);
    if (i < 0) {
      out[`K${a.kap}:${a.needle}`] = "NOT FOUND";
      continue;
    }
    // paragraph window
    let start = t.lastIndexOf("\n\n", i);
    if (start < 0) start = Math.max(0, i - 100);
    else start += 2;
    let end = t.indexOf("\n\n", i);
    if (end < 0) end = Math.min(t.length, i + 800);
    out[`K${a.kap}:${a.needle}`] = t.slice(start, end);
  }
  writeFileSync(
    "scripts/tmp-exact-anchors.json",
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log("wrote", Object.keys(out).length, "anchors");
  for (const [k, v] of Object.entries(out)) {
    console.log("\n##", k);
    console.log(v.slice(0, 400));
  }
}

main();
