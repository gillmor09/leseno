import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

async function main() {
  const b = await getSachbuchKontext("1640c419-5f83-4c62-a25b-d57190727fa4");
  const t2 = b!.kapitel[1]!.manuscript.improvedText;
  const start = t2.indexOf(
    "Wie unmittelbar sich der Verzicht auf solche Neugier bezahlt macht",
  );
  writeFileSync(
    "scripts/tmp-docusign-full.out.txt",
    t2.slice(start, start + 1400),
    "utf8",
  );
  console.error("start", start);
}

main();
