import { getRomanKontext } from "../src/lib/roman/repository";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

async function main() {
  const r = await getRomanKontext(ID, { omitCover: true });
  const ms = r?.editorial?.manuskriptText ?? "";
  const chapters = parsePlotChapters(ms);
  const re = /E-?\s*HS\s*[-–]?\s*\d+/gi;
  const counts = new Map<string, number>();
  for (const m of ms.matchAll(re)) {
    const p = m[0].replace(/\s+/g, " ").trim();
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  console.log("all plates:", Object.fromEntries(counts));
  for (const ch of chapters) {
    if (/2046/i.test(ch.body)) {
      const snip = ch.body.match(/.{0,50}2046.{0,50}/i)?.[0]?.replace(/\s+/g, " ");
      console.log(`Kap ${ch.number}:`, snip);
    }
  }
  for (const n of [13, 15]) {
    const body = chapters.find((c) => c.number === n)?.body ?? "";
    const plates = [...body.matchAll(re)].map((m) => m[0]);
    console.log(`Kap ${n} plates:`, plates);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
