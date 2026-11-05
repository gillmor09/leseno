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
  const swaps = [
    {
      find: "als Gesamtbild aus Nachweis-Automation (Kapitel 3) und Fairness an der Schnittstelle (Kapitel 8).",
      to: "als Gesamtbild aus Nachweis-Automation und Fairness an der Schnittstelle.",
    },
    {
      find: "dem 5-stufigen Nachweissystem aus Kapitel 3 und dem 4-Schleusen-Pipeline-Check",
      to: "dem etablierten 5-stufigen Nachweissystem und dem 4-Schleusen-Pipeline-Check",
    },
  ];
  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log("MISS", s.find);
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log("OK", s.find.slice(0, 70));
  }
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
      bookPassAppliedScoredAt: book.idee.manuscriptReview.scoredAt,
    },
    updatedAt: now,
  });
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
