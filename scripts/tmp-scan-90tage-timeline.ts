/**
 * Scan Kap 3/5/9 for 90-Tage-Rollout + KlarNetz timeline markers.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-scan-90tage-timeline.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const n of [3, 5, 9]) {
    const k = book.kapitel[n - 1]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${n} ${k.title} ========`);
    const re =
      /90-Tage[^\n.]{0,80}|Tage 1\s*bis\s*30|Tag 1 bis 30|zweiten Jahr|im ersten Jahr|Quartal|Rollout|Bereinigungssprint|Etappe|Phase 1|initialen Rollout|Cloud-Migration/gi;
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    while ((m = copy.exec(t))) {
      const i = m.index;
      console.log(
        `  [${m[0].slice(0, 50)}]`,
        t.slice(Math.max(0, i - 90), i + m[0].length + 140).replace(/\s+/g, " "),
      );
    }
  }
}

main();
