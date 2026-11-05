/**
 * Snapshot: Herstellung / Infografik / Export readiness.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-herstellung-readiness.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchKapitelHasHerstellung,
} from "../src/lib/sachbuch/parse";
import {
  parseSachbuchLayoutBlocks,
  stripSachbuchLayoutMarkup,
} from "../src/lib/sachbuch/herstellung-markup";
import { sachbuchInfografikBriefsForBook } from "../src/lib/sachbuch/infografik";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  console.log(`title: ${book.title}`);
  console.log(`export.suggestedTitle: ${(book.export?.suggestedTitle || "").slice(0, 100)}`);
  console.log(`cover: ${Boolean(book.export?.coverDataUrl?.startsWith("data:image/"))}`);
  console.log(`subtitle: ${(book.export?.subtitle || "").slice(0, 100)}`);
  console.log(`autor: ${book.export?.autorName || "(leer)"}`);

  const briefs = sachbuchInfografikBriefsForBook(book);
  console.log(`infografik briefs planned: ${briefs.length} → K${briefs.map((b) => b.kapitelIndex + 1).join(",")}`);

  let herst = 0;
  let info = 0;
  let merksTotal = 0;

  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const h = k.manuscript.herstellungText?.trim() || "";
    const hasH = Boolean(h) || sachbuchKapitelHasHerstellung(k);
    const blocks = h ? parseSachbuchLayoutBlocks(h) : [];
    const merks = blocks.filter((b) => b.type === "box" && b.kind === "merksatz").length;
    const boxes = blocks.filter((b) => b.type === "box").length;
    const heads = blocks.filter((b) => b.type === "heading").length;
    const hasInfo = Boolean(k.infografikDataUrl?.startsWith("data:image/"));
    const body = h ? stripSachbuchLayoutMarkup(h) : sachbuchKapitelBodyText(k);
    const words = countSachbuchWords(body);
    const score =
      (k.manuscript as { critique?: { score?: number }; lastScore?: number })
        .critique?.score ??
      (k.manuscript as { lastScore?: number }).lastScore ??
      "?";
    if (hasH) herst += 1;
    if (hasInfo) info += 1;
    merksTotal += merks;
    console.log(
      `K${i + 1}: herst=${hasH} score=${score} words=${words} H=${heads} boxes=${boxes} merks=${merks} info=${hasInfo}${
        k.infografikTitle ? ` [${k.infografikTitle}]` : ""
      }`,
    );
  }

  console.log(
    `\nsummary: herstellung ${herst}/${book.kapitel.length}, infografik ${info}/${briefs.length} planned slots, merksTotal=${merksTotal}`,
  );

  const review = book.idee?.manuscriptReview as
    | { score?: number; summary?: string; changeOrders?: unknown[] }
    | undefined;
  if (review) {
    console.log(
      `book review score=${review.score ?? "?"} COs=${Array.isArray(review.changeOrders) ? review.changeOrders.length : "?"}`,
    );
    if (review.summary) console.log(`book summary: ${review.summary.slice(0, 200)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
