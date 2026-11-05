/**
 * Scan Kap 4/6/8 for form-poisoning + checkout-conversion overlaps.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-form-dupes.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "dummy", re: /Dummy|asdf|Wegwerf|falsche (Adresse|E-?Mail)|Datenvergift|vergift|Fake-?Daten|Fantasie|test@|xyz@|Müll(daten|eingabe)/gi },
  { id: "conversion", re: /Conversion|Checkout|Abbruch|Warenkorb|Kaufabbruch|Formularabbruch|Konversion/gi },
  { id: "dark", re: /Dark Pattern|manipulativ|Zustimmen|Cookie|Opt-?in|Einwilligung.{0,40}(Klick|Zwang|nötigen)/gi },
  { id: "dublette", re: /Dublette|Syntax|Plausibilit|Stammdaten|Zahlendreher|ungültig/gi },
  { id: "volumen", re: /Datenvolumen|Durchsatz|Felder? streichen|Datenbudget|Minimierung|Überproduktion/gi },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const n of [4, 6, 8]) {
    const k = book.kapitel[n - 1]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${n} ${k.title} ========`);
    for (const p of PATTERNS) {
      const copy = new RegExp(p.re.source, p.re.flags);
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = copy.exec(t)) && count < 6) {
        count += 1;
        console.log(
          `  [${p.id}]`,
          t.slice(Math.max(0, m.index - 70), m.index + m[0].length + 160)
            .replace(/\s+/g, " "),
        );
      }
    }
  }
}

main();
