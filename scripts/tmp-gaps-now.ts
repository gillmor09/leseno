import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const r = b.idee.manuscriptReview;
  const lines = [
    `SCORE ${r.salesScore}`,
    `SUMMARY ${r.scoreSummary}`,
    "GAPS:",
    ...(r.gaps ?? []).map((g, i) => `${i + 1}. ${g}`),
    "ORDERS:",
    ...(r.changeOrders ?? []).map((g, i) => `${i + 1}. ${g}`),
  ];

  for (let i = 0; i < b.kapitel.length; i++) {
    const t = b.kapitel[i]!.manuscript.improvedText;
    lines.push(`\n===== KAP ${i + 1} END =====`);
    lines.push(t.slice(-700));
  }

  const t2 = b.kapitel[1]!.manuscript.improvedText;
  const t3 = b.kapitel[2]!.manuscript.improvedText;
  for (const [name, t, needles] of [
    ["k2", t2, ["docusign", "pflichtfeld", "formular", "felder"]],
    ["k3", t3, ["docusign", "pflichtfeld", "formular", "felder", "expedia"]],
  ] as const) {
    lines.push(`\n===== ${name} hits =====`);
    const lower = t.toLowerCase();
    for (const n of needles) {
      let from = 0;
      let hits = 0;
      while (hits < 2) {
        const j = lower.indexOf(n, from);
        if (j < 0) break;
        hits++;
        lines.push(
          `${n}#${hits}: ${t.slice(Math.max(0, j - 70), j + 200).replace(/\s+/g, " ")}`,
        );
        from = j + n.length;
      }
    }
  }

  writeFileSync("scripts/tmp-gaps-now.out.txt", lines.join("\n"), "utf8");
  console.error("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
