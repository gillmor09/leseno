import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t3 = b.kapitel[2]!.manuscript.improvedText;
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  const t5 = b.kapitel[4]!.manuscript.improvedText;
  const out = [
    "\n### k3 merksätze ###\n",
    [...t3.matchAll(/Merksatz:[^\n]+/g)].map((m) => m[0]).join("\n"),
    "\n### k4 merksätze ###\n",
    [...t4.matchAll(/Merksatz:[^\n]+/g)].map((m) => m[0]).join("\n"),
    "\n### k5 merksätze ###\n",
    [...t5.matchAll(/Merksatz:[^\n]+/g)].map((m) => m[0]).join("\n") || "(none)",
    "\n### k5 mid45 ###\n",
    t5.slice(Math.floor(t5.length * 0.35), Math.floor(t5.length * 0.35) + 450),
    "\n### k5 mid70 ###\n",
    t5.slice(Math.floor(t5.length * 0.55), Math.floor(t5.length * 0.55) + 450),
    "\n### k3 mid55 ###\n",
    t3.slice(Math.floor(t3.length * 0.55), Math.floor(t3.length * 0.55) + 400),
    "\n### k4 mid50 ###\n",
    t4.slice(Math.floor(t4.length * 0.5), Math.floor(t4.length * 0.5) + 400),
  ].join("");
  writeFileSync("scripts/tmp-2gaps-snip.out.txt", out, "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
