import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const r = b.idee.manuscriptReview;
  const lines = [
    `SCORE ${r.salesScore}`,
    "GAPS:",
    ...(r.gaps ?? []).map((g, i) => `${i + 1}. ${g}`),
    "ORDERS:",
    ...(r.changeOrders ?? []).map((g, i) => `${i + 1}. ${g}`),
  ];
  const t5 = b.kapitel[4]!.manuscript.improvedText;
  const idx = t5.indexOf("Ihr Blatt für den Montagmorgen ist das 9-KPI-Cockpit");
  lines.push("\n===== K5 COCKPIT =====\n");
  lines.push(t5.slice(idx, idx + 2200));
  writeFileSync("scripts/tmp-2gaps-now.out.txt", lines.join("\n"), "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
