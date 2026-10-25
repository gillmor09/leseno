/**
 * Resume manuscript improve for chapters that still need a hop
 * (first Lektorat or Buch-Pass newer than improvedAt). Then book-score.
 */
import {
  improveSachbuchKapitelManuscript,
  scoreSachbuchBookManuscript,
  SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS,
} from "../src/lib/sachbuch/manuscript";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelNeedsManuscriptImprove,
} from "../src/lib/sachbuch/parse";
import { setSachbuchGuideStep } from "../src/lib/sachbuch/idee-refine";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const EXTRA = [...SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS];

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await setSachbuchGuideStep(ID, "manuscript");
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let n = 0; n < book.kapitel.length; n++) {
    const k = book.kapitel[n]!;
    if (!sachbuchKapitelNeedsManuscriptImprove(book, k.id)) {
      console.log(
        `skip ${n + 1} (aktuell, improved=${countSachbuchWords(k.manuscript.improvedText)})`,
      );
      continue;
    }
    const draft = countSachbuchWords(
      k.manuscript.improvedText.trim() || k.manuscript.draftText,
    );
    console.log(
      `=== Kap ${n + 1} start ===`,
      new Date().toISOString(),
      `vorlage=${draft}`,
    );
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        book = await improveSachbuchKapitelManuscript({
          sachbuchId: ID,
          kapitelId: k.id,
          extraChangeOrders: EXTRA,
        });
        const u = book.kapitel[n]!;
        const improved = countSachbuchWords(u.manuscript.improvedText);
        console.log(
          `Kap ${n + 1} ok: score=${u.manuscript.salesScore} ${improved} words`,
        );
        ok = true;
      } catch (e) {
        console.error(`Kap ${n + 1} attempt ${attempt} failed:`, e);
        book = (await getSachbuchKontext(ID))!;
        if (attempt < 3) await sleep(8_000 * attempt);
      }
    }
    if (!ok) console.error(`Kap ${n + 1} GIVE UP after 3 attempts — continue`);
  }

  console.log("=== Book score ===", new Date().toISOString());
  try {
    book = await scoreSachbuchBookManuscript(ID);
    console.log(
      `Book score=${book.idee.manuscriptReview.salesScore}`,
      book.idee.manuscriptReview.scoreSummary.slice(0, 200),
    );
  } catch (e) {
    console.error("Book score failed:", e);
  }
  console.log("=== Done ===", new Date().toISOString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
