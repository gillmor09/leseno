/**
 * Dump exact targets for the 4 current book COs.
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  console.log("===== CO1 meta parens / chapter self-refs =====");
  for (const n of [3, 4, 6, 8]) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    const patterns = [
      /\([^)]{0,40}[Kk]apitel[^)]{0,120}\)/g,
      /—[^—.]{0,40}[Kk]apitel[^—.]{0,80}—/g,
      /das war Kapitel[^.]{0,80}/gi,
      /bilanzen? wir erst in Kapitel[^.]{0,100}/gi,
      /noch nicht die gesamte Sales Velocity[^.!]{0,200}/gi,
    ];
    console.log(`\n--- K${n} ---`);
    for (const re of patterns) {
      const copy = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = copy.exec(t))) {
        console.log(
          "·",
          t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 80).replace(/\s+/g, " "),
        );
      }
    }
  }

  console.log("\n===== CO2 timeline anchors =====");
  for (const [n, needles] of [
    [3, ["Reife- und Governance-Pfad", "Vorbereitungszeit", "Sales Velocity"]],
    [5, ["Retrospektive", "Pilot", "zweiten Jahr", "Reifephase", "90-Tage-Rollout"]],
    [9, ["Sales Cycle Velocity", "vier Wochen", "Minuten", "Stunden", "neun Wochen"]],
  ] as const) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    console.log(`\n--- K${n} ---`);
    for (const needle of needles) {
      const i = t.indexOf(needle);
      if (i < 0) {
        console.log("MISS", needle);
        continue;
      }
      console.log(needle, "→", t.slice(Math.max(0, i - 40), i + 220).replace(/\s+/g, " "));
    }
  }

  console.log("\n===== CO3 lean intros ab K4 =====");
  for (const n of [4, 5, 6, 9]) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    const hits = [
      ...t.matchAll(
        /(?:Muda|Poka-Yoke|5S|Jidoka)[^\n.]{0,20}(?:bekannt|bedeutet|heißt|aus der|Lean|Verschwendung|Prinzip[,:]?\s+(?:greift|verhindert|steht))/gi,
      ),
    ];
    console.log(`K${n}:`, hits.length);
    for (const m of hits.slice(0, 4)) {
      console.log(" ", t.slice(m.index! - 30, m.index! + 140).replace(/\s+/g, " "));
    }
  }

  console.log("\n===== CO4 typos =====");
  for (const [n, needles] of [
    [2, ["VDP-Pyramide", "Privacy Value Thinking", "Qualitäts"]],
    [7, ["tatslich", "tatsächlich"]],
    [8, ["personenbezogen", "Privacy Value Thinking und Value-Driven"]],
    [9, ["konsequenzt", "unzurend", "konsequent", "unzureichend"]],
  ] as const) {
    const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
    console.log(`\n--- K${n} ---`);
    for (const needle of needles) {
      let from = 0;
      let c = 0;
      while (c < 3) {
        const i = t.indexOf(needle, from);
        if (i < 0) break;
        c += 1;
        console.log(needle, t.slice(Math.max(0, i - 50), i + needle.length + 60).replace(/\s+/g, " "));
        from = i + needle.length;
      }
      if (!c) console.log(needle, "— none");
    }
  }
}

main();
