/**
 * Re-score all chapters on improvedText, then book — honest ladder + chapter clamp.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-rescore-honest.ts
 */
import {
  scoreSachbuchBookManuscript,
  scoreSachbuchKapitelManuscript,
} from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelNeedsManuscriptImprove } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Immediate honesty: no book-10 while every chapter is still 9.
  const maxCh = Math.max(
    ...book.kapitel.map((k) => k.manuscript.salesScore ?? 0),
  );
  if (
    book.idee.manuscriptReview.salesScore != null &&
    book.idee.manuscriptReview.salesScore > Math.min(9, maxCh < 10 ? 9 : maxCh + 1)
  ) {
    const clamped = maxCh < 10 ? 9 : Math.min(10, maxCh + 1);
    console.log(
      `clamp stored book ${book.idee.manuscriptReview.salesScore} → ${clamped}`,
    );
    await patchSachbuchBook(ID, {
      idee: {
        ...book.idee,
        manuscriptReview: {
          ...book.idee.manuscriptReview,
          salesScore: clamped,
          scoreSummary:
            (book.idee.manuscriptReview.scoreSummary || "") +
            " (Score an Kapitel-Maximum angepasst — Buch-10 erst wenn mind. ein Kapitel 10 erreicht.)",
        },
      },
    });
  }

  book = (await getSachbuchKontext(ID))!;
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    console.log(`\n=== score K${i + 1}: ${k.title.slice(0, 50)} ===`);
    try {
      book = await scoreSachbuchKapitelManuscript({
        sachbuchId: ID,
        kapitelId: k.id,
      });
      const fresh = book.kapitel.find((c) => c.id === k.id)!;
      console.log(
        `→ ${fresh.manuscript.salesScore}/10 orders=${fresh.manuscript.changeOrders.length} gaps=${fresh.manuscript.gaps.length}`,
      );
      for (const o of fresh.manuscript.changeOrders) {
        console.log("  O:", o.slice(0, 140));
      }
    } catch (e) {
      console.error(`K${i + 1} FAILED`, e);
    }
  }

  console.log("\n=== Buch bewerten ===");
  book = await scoreSachbuchBookManuscript(ID);
  const rev = book.idee.manuscriptReview;
  console.log("book:", rev.salesScore, "gaps", rev.gaps.length, "orders", rev.changeOrders.length);
  console.log("summary:", rev.scoreSummary?.slice(0, 300));
  for (const o of rev.changeOrders) console.log("  O:", o.slice(0, 160));

  console.log("\nchapter scores:");
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    console.log(
      `K${i + 1}: ${k.manuscript.salesScore} orders=${k.manuscript.changeOrders.length} needsImprove=${sachbuchKapitelNeedsManuscriptImprove(book, k.id)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
