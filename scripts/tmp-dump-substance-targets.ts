/**
 * Dump exact sentences for substance COs (echoes, timeline, lean).
 * Usage: npx tsx --env-file=.env.local scripts/tmp-dump-substance-targets.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function snipsAround(body: string, re: RegExp, max = 3): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = copy.exec(body)) && out.length < max) {
    const i = m.index;
    // expand to sentence-ish window
    let a = body.lastIndexOf(". ", Math.max(0, i - 20));
    if (a < 0 || i - a > 400) a = Math.max(0, i - 180);
    else a += 2;
    let b = body.indexOf(". ", i + m[0].length);
    if (b < 0 || b - i > 500) b = Math.min(body.length, i + m[0].length + 220);
    else b += 1;
    out.push(body.slice(a, b).replace(/\s+/g, " ").trim());
  }
  return out;
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const echoRe =
    /Baymard|Gartner|DataGrail|Cisco|1[.,]?400|1[.,]?500 US|1,6- bis|Poka-Yoke|Dark Data|IBM|Ponemon|Bitkom|1-10-100|1\/10\/100/gi;

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const t = sachbuchKapitelBodyText(k);
    console.log(`\n======== K${i + 1} ========`);
    for (const s of snipsAround(t, echoRe, 8)) {
      console.log("·", s.slice(0, 280));
    }
  }

  console.log("\n======== K5/K9 timeline markers ========");
  for (const idx of [4, 8]) {
    const t = sachbuchKapitelBodyText(book.kapitel[idx]!);
    for (const re of [
      /45[.,]?000|Ausweiskopien|Ticket-Archiv|RAG|5 Jahre|Löschroutine|Cloud-Migration|zweiten Jahr/gi,
    ]) {
      console.log(`\n--- K${idx + 1} ---`);
      for (const s of snipsAround(t, re, 6)) console.log("·", s.slice(0, 320));
    }
  }
}

main();
