import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t = b.kapitel[4]!.manuscript.improvedText;
  const t1 = b.kapitel[0]!.manuscript.improvedText;
  const t4 = b.kapitel[3]!.manuscript.improvedText;

  const slices: [string, string, number][] = [
    ["k5-databerg", t, t.toLowerCase().indexOf("databerg")],
    ["k5-90tage", t, t.toLowerCase().indexOf("ihre 90-tage-ki-roadmap")],
    ["k5-kpi", t, t.toLowerCase().indexOf("9-kpi lean-privacy-cockpit")],
    ["k5-end", t, t.length - 1800],
    ["k1-end", t1, t1.length - 900],
    ["k1-kpi", t1, t1.toLowerCase().indexOf("die 3 kern-kpis")],
    ["k4-end", t4, t4.length - 900],
    ["k2-end", b.kapitel[1]!.manuscript.improvedText, b.kapitel[1]!.manuscript.improvedText.length - 500],
    ["k3-end", b.kapitel[2]!.manuscript.improvedText, b.kapitel[2]!.manuscript.improvedText.length - 500],
  ];

  const out: string[] = [];
  for (const [name, src, idx] of slices) {
    const start = Math.max(0, idx);
    out.push(`\n\n########## ${name} @${start} ##########\n`);
    out.push(src.slice(start, start + 2200));
  }
  writeFileSync("scripts/tmp-extract-ch5.out.txt", out.join(""), "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
