import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

async function main() {
  const b = await getSachbuchKontext("1640c419-5f83-4c62-a25b-d57190727fa4");
  const t2 = b!.kapitel[1]!.manuscript.improvedText;
  const start = t2.indexOf(
    "Wie unmittelbar sich der Verzicht auf solche Neugier bezahlt macht",
  );
  const nextPara = t2.indexOf("\n\n", start + 900);
  writeFileSync(
    "scripts/tmp-docusign-end.out.txt",
    JSON.stringify({ nextPara, text: t2.slice(start, nextPara + 2) }),
    "utf8",
  );
}

main();
