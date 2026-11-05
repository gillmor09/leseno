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
  const find = "Jede Ebene der VDP-Pyramide erhält ihre spezifische Spitzenkennzahl";
  const to =
    "Jede Ebene der Qualitäts-Pyramide des Privacy Value Thinking erhält ihre spezifische Spitzenkennzahl";
  if (!text.includes(find)) {
    console.log("MISS", find);
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
  console.log("OK VDP-Pyramide → Qualitäts-Pyramide des PVT");
  console.log("leftover VDP-Pyramide:", text.includes("VDP-Pyramide"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
