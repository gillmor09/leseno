/**
 * Set author to Bernd Krpec on all Privacy-Value editions (full / compact / teaser).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-set-autor-bernd.ts
 */
import { SACHBUCH_HERAUSGEBER_NAME } from "../src/lib/sachbuch/impressum";
import {
  getSachbuchKontext,
  listSachbuchKontexte,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const COMPACT_ID = "47194844-8130-4938-91ae-d6cddd14abe4";
const AUTOR = SACHBUCH_HERAUSGEBER_NAME;

async function findTeaserId(): Promise<string | null> {
  const list = await listSachbuchKontexte();
  for (const row of list) {
    const book = await getSachbuchKontext(row.id);
    if (!book) continue;
    if (
      book.idee.edition === "teaser" &&
      (book.idee.sourceBookId === COMPACT_ID ||
        book.idee.sourceBookId === FULL_ID ||
        /teaser/i.test(book.title) ||
        /teaser/i.test(book.export.suggestedTitle) ||
        /privacy value/i.test(book.title))
    ) {
      return book.id;
    }
  }
  // Fallback: any teaser linked in the family
  for (const row of list) {
    const book = await getSachbuchKontext(row.id);
    if (book?.idee.edition === "teaser") return book.id;
  }
  return null;
}

async function patchBook(id: string) {
  const book = await getSachbuchKontext(id);
  if (!book) throw new Error(`Buch nicht gefunden: ${id}`);

  const vorsatz = {
    ...book.export.vorsatz,
    titelseite: {
      ...book.export.vorsatz.titelseite,
      autor: AUTOR,
    },
  };

  await upsertSachbuchExport({
    id,
    autorName: AUTOR,
    vorsatz,
  });

  const done = await getSachbuchKontext(id);
  if (!done) throw new Error(`Nach Update nicht ladbar: ${id}`);
  return {
    id,
    edition: done.idee.edition,
    title: done.title,
    autorName: done.export.autorName,
    titelseiteAutor: done.export.vorsatz.titelseite.autor,
  };
}

async function main() {
  const teaserId = await findTeaserId();
  const ids = [FULL_ID, COMPACT_ID, ...(teaserId ? [teaserId] : [])];
  if (!teaserId) {
    console.warn("WARN: keine Teaser-Ausgabe gefunden — nur Hauptband + Kompakt.");
  }
  const results = [];
  for (const id of ids) {
    results.push(await patchBook(id));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
