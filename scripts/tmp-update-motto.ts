/**
 * Replace Titelei-Motto with a punchier line from the book's core claim.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-update-motto.ts
 */
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

/**
 * Epigraph: Vorwort-These in zwei Schlägen — aufrüttelnd, buch-eigen,
 * näher an Deming/Lean als an Marketing-Tagline.
 */
const MOTTO = `Viele Privacy-Probleme sind keine juristischen Rätsel —
sondern Qualitäts- und Prozessfehler.`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  const vorsatz = {
    ...book.export.vorsatz,
    motto: MOTTO,
  };

  await upsertSachbuchExport({ id: ID, vorsatz });

  const done = await getSachbuchKontext(ID);
  console.log(JSON.stringify({ motto: done!.export.vorsatz.motto }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
