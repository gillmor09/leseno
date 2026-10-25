import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { writeFileSync } from "node:fs";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const lines: string[] = [];
  for (let i = 0; i < b.kapitel.length; i++) {
    const t = b.kapitel[i]!.manuscript.improvedText || "";
    const lower = t.toLowerCase();
    lines.push(`\n=== KAP ${i + 1} len=${t.length} ===`);
    for (const needle of [
      "nennen wir ihn",
      "auch in diesem kapitel",
      "infobox",
      "buchsatz",
      "satzanweisung",
      "für den satz",
      "grafik",
      "kasten",
      "connecttel",
    ]) {
      let from = 0;
      let hits = 0;
      while (hits < 3) {
        const j = lower.indexOf(needle, from);
        if (j < 0) break;
        hits++;
        lines.push(
          `${needle}#${hits}: ${JSON.stringify(t.slice(Math.max(0, j - 60), j + 180).replace(/\s+/g, " "))}`,
        );
        from = j + needle.length;
      }
    }
    lines.push(`END: ${JSON.stringify(t.slice(-400).replace(/\s+/g, " "))}`);
  }
  writeFileSync("scripts/tmp-find-polish.out.txt", lines.join("\n"), "utf8");
  console.error("wrote scripts/tmp-find-polish.out.txt", lines.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
