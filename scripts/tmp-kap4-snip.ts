import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

async function main() {
  const b = await getSachbuchKontext("1640c419-5f83-4c62-a25b-d57190727fa4");
  const t = b!.kapitel[3]!.manuscript.improvedText;
  const j = t.toLowerCase().indexOf("nennen wir ihn");
  writeFileSync(
    "scripts/tmp-kap4-snip.out.txt",
    t.slice(Math.max(0, j - 250), j + 220),
    "utf8",
  );
}
main();
