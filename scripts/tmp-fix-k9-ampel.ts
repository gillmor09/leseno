import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[8]!;
  let text = sachbuchKapitelBodyText(k);
  const i = text.indexOf("Risiko-Ampel aus Kapitel 2");
  console.log(JSON.stringify(text.slice(i - 80, i + 120)));
  const find = "die internen Pfade der Risiko-Ampel aus Kapitel 2 an";
  const to = "die internen Pfade der bereits etablierten Risiko-Ampel an";
  if (!text.includes(find)) {
    console.log("MISS");
    return;
  }
  text = text.split(find).join(to);
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
    },
    updatedAt: now,
  });
  console.log("OK");
  // leftover numbered Kapitel
  const left = [...text.matchAll(/Kapitel\s+\d/g)].map((m) => m[0]);
  console.log("numbered Kapitel left:", left);
  console.log(
    "vorangegangenen Kapitel(n):",
    (text.match(/vorangegangenen Kapiteln?/g) || []).length,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
