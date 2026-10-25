import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const lines: string[] = [];

  for (const i of [0, 3, 4] as const) {
    const t = b.kapitel[i]!.manuscript.improvedText || "";
    lines.push(`\n===== KAP ${i + 1} len=${t.length} =====`);
    const needles = [
      "databerg",
      "veritas",
      "85 Prozent",
      "85 %",
      "dark data",
      "rot-daten",
      "90-tage",
      "90 tage",
      "ki-roadmap",
      "gateway",
      "hinweis für buchsatz",
      "9-kpi",
      "neun",
      "kpi-cockpit",
      "mittelstand",
    ];
    const lower = t.toLowerCase();
    for (const needle of needles) {
      let from = 0;
      let hits = 0;
      while (hits < 4) {
        const j = lower.indexOf(needle, from);
        if (j < 0) break;
        hits++;
        lines.push(
          `${needle}#${hits} @${j}: ${JSON.stringify(t.slice(Math.max(0, j - 80), j + 220).replace(/\s+/g, " "))}`,
        );
        from = j + needle.length;
      }
    }
    lines.push(`END: ${JSON.stringify(t.slice(-500).replace(/\s+/g, " "))}`);
  }

  writeFileSync("scripts/tmp-find-orders.out.txt", lines.join("\n"), "utf8");
  console.error("wrote", lines.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
