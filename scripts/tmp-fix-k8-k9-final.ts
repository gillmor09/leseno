/**
 * Final polish: remove K8 Montagmorgen; organicize K9 chapter back-refs.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k8-k9-final.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // ── K8 Montagmorgen ──
  {
    const k = book.kapitel[7]!;
    let text = sachbuchKapitelBodyText(k);
    const i = text.indexOf("Montagmorgen");
    console.log("K8 Montagmorgen context:");
    console.log(JSON.stringify(text.slice(Math.max(0, i - 120), i + 200)));

    const swaps: Array<{ find: string; to: string }> = [
      {
        find: "Widerruft eine Kundin ihre Einwilligung am Montagmorgen, erreicht sie am Dienstagmorgen dennoch die automatisierte Rabatt-Mai",
        to: "PLACEHOLDER_NEED_FULL",
      },
    ];
    // get fuller sentence
    const start = text.lastIndexOf(".", i - 1) + 1;
    const end = text.indexOf(".", i) + 1;
    console.log("\nFULL SENTENCE:", JSON.stringify(text.slice(start, end || i + 250)));
  }

  // ── K9 Kapitel refs ──
  {
    const k = book.kapitel[8]!;
    const text = sachbuchKapitelBodyText(k);
    let from = 0;
    console.log("\n=== K9 Kapitel contexts ===");
    while (true) {
      const i = text.indexOf("Kapitel", from);
      if (i < 0) break;
      console.log(JSON.stringify(text.slice(Math.max(0, i - 80), i + 140)));
      from = i + 7;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
