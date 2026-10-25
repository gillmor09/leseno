import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t2 = b.kapitel[1]!.manuscript.improvedText;
  const t3 = b.kapitel[2]!.manuscript.improvedText;
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  const t1 = b.kapitel[0]!.manuscript.improvedText;
  const j = t2.toLowerCase().indexOf("docusign");
  const j2 = t2.toLowerCase().indexOf("formulare, die zwanzig");
  const mid3 = Math.floor(t3.length * 0.42);
  const mid3b = Math.floor(t3.length * 0.68);
  const mid4 = Math.floor(t4.length * 0.38);
  const mid4b = Math.floor(t4.length * 0.65);
  const out = [
    "\n##### k1 start #####\n",
    t1.slice(0, 400),
    "\n\n##### k2 docusign #####\n",
    t2.slice(Math.max(0, j - 250), j + 900),
    "\n\n##### k2 20 felder #####\n",
    t2.slice(Math.max(0, j2 - 80), j2 + 500),
    "\n\n##### k3 mid42 #####\n",
    t3.slice(mid3, mid3 + 500),
    "\n\n##### k3 mid68 #####\n",
    t3.slice(mid3b, mid3b + 500),
    "\n\n##### k4 mid38 #####\n",
    t4.slice(mid4, mid4 + 500),
    "\n\n##### k4 mid65 #####\n",
    t4.slice(mid4b, mid4b + 500),
  ].join("");
  writeFileSync("scripts/tmp-gaps-snip.out.txt", out, "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
