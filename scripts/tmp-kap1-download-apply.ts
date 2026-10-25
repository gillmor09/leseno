/**
 * Kap1 Chargeback-Montag: early download hint + final book rescore.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const OLD =
  "Wer dieses Blatt in der Montagsrunde hochhält, hat den unsichtbaren Kosten zum ersten Mal einen Namen gegeben.";

const NEU =
  "Wer dieses Blatt in der Montagsrunde hochhält, hat den unsichtbaren Kosten zum ersten Mal einen Namen gegeben. Die ausfüllbare Vorlage liegt unter leseno.de/lean-privacy.";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[0]!;
  let t = k.manuscript.improvedText;
  if (!t.includes(OLD)) throw new Error("anchor not found");
  if (t.split(OLD).length - 1 !== 1) throw new Error("anchor not unique");
  t = t.replace(OLD, NEU);
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: t,
    manuscript: { ...k.manuscript, improvedText: t, improvedAt: now },
    updatedAt: now,
  });
  console.log("Kap1 words", countSachbuchWords(t));

  console.log("=== Book score ===");
  const scored = await scoreSachbuchBookManuscript(ID);
  const r = scored.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r.salesScore,
        summary: r.scoreSummary,
        gaps: r.gaps,
        orders: r.changeOrders,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
