/**
 * Set Titelei imprint + Impressum (email, website, 1. Auflage)
 * for Hauptband and Kompakt.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-update-titelei-privacyvalue.ts
 */
import {
  buildSachbuchImpressum,
  SACHBUCH_DEFAULT_IMPRINT,
  SACHBUCH_HERAUSGEBER_EMAIL,
  SACHBUCH_HERAUSGEBER_WEBSITE,
} from "../src/lib/sachbuch/impressum";
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const COMPACT_ID = "47194844-8130-4938-91ae-d6cddd14abe4";

async function patchBook(id: string) {
  const book = await getSachbuchKontext(id);
  if (!book) throw new Error(`Buch nicht gefunden: ${id}`);

  const autor =
    book.export.autorName.trim() ||
    book.export.vorsatz.titelseite.autor.trim();
  const year =
    book.export.vorsatz.impressum.jahr.trim() ||
    String(new Date().getFullYear());

  const vorsatz = {
    ...book.export.vorsatz,
    titelseite: {
      ...book.export.vorsatz.titelseite,
      imprint: SACHBUCH_DEFAULT_IMPRINT,
    },
    impressum: buildSachbuchImpressum({
      jahr: year,
      autorPseudonym: autor,
      auflage: "1. Auflage",
    }),
  };

  await upsertSachbuchExport({ id, vorsatz });

  const done = await getSachbuchKontext(id);
  if (!done) throw new Error(`Nach Update nicht ladbar: ${id}`);
  return {
    id,
    title: done.title,
    imprint: done.export.vorsatz.titelseite.imprint,
    email: SACHBUCH_HERAUSGEBER_EMAIL,
    website: SACHBUCH_HERAUSGEBER_WEBSITE,
    jahr: done.export.vorsatz.impressum.jahr,
    absatz0: done.export.vorsatz.impressum.absatz[0]?.slice(0, 120),
    absatz1: done.export.vorsatz.impressum.absatz[1],
  };
}

async function main() {
  const results = [];
  for (const id of [FULL_ID, COMPACT_ID]) {
    results.push(await patchBook(id));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
