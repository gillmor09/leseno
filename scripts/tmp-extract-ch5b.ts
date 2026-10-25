import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t = b.kapitel[4]!.manuscript.improvedText;
  const idx = t.toLowerCase().indexOf("wie wir bereits in kapitel 1 anhand des databerg");
  const idx90 = t.toLowerCase().indexOf("in den tagen einunddreißig");
  const idxKpi = t.toLowerCase().indexOf("neuntens die entschla");
  const out = [
    "\n##### databerg-para #####\n",
    t.slice(Math.max(0, idx - 200), idx + 700),
    "\n\n##### 90tage-mid #####\n",
    t.slice(idx90, idx90 + 1600),
    "\n\n##### kpi9 #####\n",
    t.slice(idxKpi, idxKpi + 800),
  ].join("");
  writeFileSync("scripts/tmp-extract-ch5b.out.txt", out, "utf8");
  console.error("ok", { idx, idx90, idxKpi });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
