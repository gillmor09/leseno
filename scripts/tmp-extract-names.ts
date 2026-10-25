import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t2 = b.kapitel[1]!.manuscript.improvedText;
  const t3 = b.kapitel[2]!.manuscript.improvedText;
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  const t5 = b.kapitel[4]!.manuscript.improvedText;
  const out = [
    "\n##### k2 steckbrief #####\n",
    t2.slice(
      Math.max(0, t2.toLowerCase().indexOf("auftrag") - 200),
      t2.toLowerCase().indexOf("auftrag") + 1800,
    ),
    "\n\n##### k3 14 tage #####\n",
    t3.slice(
      Math.max(0, t3.toLowerCase().indexOf("14-tage") - 80),
      t3.toLowerCase().indexOf("14-tage") + 1600,
    ),
    "\n\n##### k4 kpis #####\n",
    t4.slice(
      Math.max(0, t4.toLowerCase().indexOf("auskunft") - 80),
      t4.toLowerCase().indexOf("auskunft") + 1200,
    ),
    "\n\n##### k5 register end #####\n",
    t5.slice(-1400),
  ].join("");
  writeFileSync("scripts/tmp-extract-names.out.txt", out, "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
