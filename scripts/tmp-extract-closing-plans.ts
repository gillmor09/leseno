/**
 * Extract candidate advisor/Monday-morning closing sections per chapter.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const LEADS = [
  "Drei Schritte für den Montagmorgen",
  "Was am Montagmorgen zählt",
  "Was Sie am nächsten Montagmorgen",
  "Starten Sie noch in dieser Woche",
  "Beenden Sie noch in dieser Woche",
  "Praxis-Checkliste",
  "Formieren Sie noch in dieser Woche",
  "Wenn Sie am kommenden Montag",
  "brauchen Sie am kommenden Montagmorgen",
  "Erstens: Starten Sie",
  "Der Gang an den digitalen Gemba",
  "Um den Übergang vom statischen Löschkonzept",
  "um diesen Hebel in Ihrer Organisation umzulegen",
  "tragfähige Fundament für Audit by Design",
  "Drei konkrete",
  "sofort wirksamen Schritten",
  "Ihre nächsten Schritte",
  "Nächste Schritte",
];

async function main() {
  console.log("fetch…");
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  console.log("kapitel", book.kapitel.length);
  const out: Array<{
    kap: number;
    title: string;
    hits: Array<{ lead: string; idx: number; fromEnd: number; excerpt: string }>;
    lastLead: string;
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const body = sachbuchKapitelBodyText(k);
    const hits: Array<{ lead: string; idx: number; fromEnd: number; excerpt: string }> =
      [];
    for (const lead of LEADS) {
      let from = 0;
      while (true) {
        const idx = body.indexOf(lead, from);
        if (idx < 0) break;
        hits.push({
          lead,
          idx,
          fromEnd: body.length - idx,
          excerpt: body.slice(idx, idx + 500).replace(/\s+/g, " "),
        });
        from = idx + lead.length;
      }
    }
    hits.sort((a, b) => a.idx - b.idx);
    const paras = body.split(/\n\n+/).filter((p) => p.trim());
    out.push({
      kap: i + 1,
      title: k.title,
      hits,
      lastLead: paras.at(-1)?.slice(0, 120).replace(/\s+/g, " ") ?? "",
    });
    console.log(`K${i + 1}: ${hits.length} hits, last="${out[i]!.lastLead}"`);
  }

  writeFileSync("scripts/tmp-closing-plans.json", JSON.stringify(out, null, 2), "utf8");
  console.log("wrote");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
