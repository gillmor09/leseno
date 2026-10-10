import { getRomanKontext } from "../src/lib/roman/repository";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

async function main() {
  const id =
    process.env.ROMAN_ID?.trim() || "c7f4c1ad-b4f2-493d-87a5-321e38102300";
  const roman = await getRomanKontext(id, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ch8 = parsePlotChapters(roman.editorial.manuskriptText ?? "").find(
    (c) => c.number === 8,
  );
  if (!ch8) throw new Error("no ch8");
  const re =
    /.{0,100}(fünf Meter fünfzig|vier Meter fünfundachtzig|vierzig Zentimeter|40 Zentimeter|Außenkante Klinker|Restplatz).{0,140}/gi;
  const hits = [...ch8.body.matchAll(re)];
  console.log(`hits: ${hits.length}`);
  for (const h of hits) console.log(`---\n${h[0]}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
