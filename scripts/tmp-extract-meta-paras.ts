/**
 * Extract full paragraphs containing meta-xref artifacts (Kap 4–9).
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const META =
  /statt sie neu|Hier im Qualitätskapitel|meinen hier dasselbe|sagen dasselbe|Kein neues Methodenkapitel|nicht als erneute|herangezogen haben|bereits in Kapitel|aus Kapitel \d|dieselbe[n]? .{0,40} aus Kapitel|dasselbe .{0,40} aus Kapitel|denselben .{0,50} aus Kapitel|gelten (hier )?unverändert|übersetzen wir (diese|sie)|jetzt (als|auf|übersetzt)|Gartner, bereits|Cisco-(ROI-Rechnung|Benchmark|Erhebungen|Studien|Zahlen|Consumer)|Baymard-Befunde|DataGrail bestätigt|trifft wieder auf Deming|IDC bestätigt denselben|Gartner-Auskunftskosten|Gartner-Zahlen|1-10-100-(Regel|Logik) aus Kapitel/i;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Array<{ kap: number; paras: string[] }> = [];
  for (let i = 3; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const paras = body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => META.test(p));
    out.push({ kap: i + 1, paras });
  }
  writeFileSync("scripts/tmp-meta-paras.json", JSON.stringify(out, null, 2), "utf8");
  console.log(out.map((o) => `K${o.kap}: ${o.paras.length}`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
