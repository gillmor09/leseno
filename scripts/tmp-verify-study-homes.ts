import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (const term of ["Cisco", "Gartner", "Baymard", "DataGrail", "Dark Data", "1,6-", "1.400"]) {
    const rows: string[] = [];
    book.kapitel.forEach((k, i) => {
      const body = sachbuchKapitelBodyText(k);
      const n = (body.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? [])
        .length;
      if (n) rows.push(`K${i + 1}×${n}`);
    });
    console.log(`${term}: ${rows.join(", ") || "—"}`);
  }
  // leftover 75-vertrauen context in K8
  const k8 = sachbuchKapitelBodyText(book.kapitel[7]!);
  const idx = k8.search(/75 Prozent|nicht bei Unternehmen kaufen/i);
  if (idx >= 0) {
    console.log("\nK8 leftover:", k8.slice(idx - 40, idx + 120).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
