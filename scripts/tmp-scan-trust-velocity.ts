/**
 * Scan Kap 3/8/9 for B2B Trust Center + sales velocity metrics.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-trust-velocity.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "trust", re: /Trust[- ]?Center|Vertrauensportal|Nachweisportal/gi },
  { id: "weeks", re: /neun Wochen|9 Wochen|zwölf Tage|12 Tage|sechs Wochen|6 Wochen|fünf Wochen|28\s*%|minus 28|−\s*28|verkürzte?[rn]? Vertrieb|Sales Velocity|Verkaufszyklus|B2B-Verkauf/gi },
  { id: "audit", re: /Lieferantenaudit|Fragebogen|Prüfdauer|Vorbereitungszeit|B2B-Ausschreibung/gi },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const n of [3, 7, 8, 9]) {
    const k = book.kapitel[n - 1]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${n} ${k.title} ========`);
    for (const p of PATTERNS) {
      const copy = new RegExp(p.re.source, p.re.flags);
      let m: RegExpExecArray | null;
      let c = 0;
      while ((m = copy.exec(t)) && c < 8) {
        c += 1;
        console.log(
          `  [${p.id}:${m[0]}]`,
          t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 180)
            .replace(/\s+/g, " "),
        );
      }
    }
  }
}

main();
