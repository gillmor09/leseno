/**
 * Sync compact-edition marketing/Vorsatz from the Hauptband.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-sync-compact-titelei.ts [compactId]
 */
import { buildSachbuchCompactEditionCopy } from "../src/lib/sachbuch/compact";
import {
  buildSachbuchImpressum,
  SACHBUCH_DEFAULT_IMPRINT,
} from "../src/lib/sachbuch/impressum";
import {
  getSachbuchKontext,
  listSachbuchKontexte,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function findCompactId(): Promise<string | null> {
  const arg = process.argv[2]?.trim();
  if (arg) return arg;
  const list = await listSachbuchKontexte();
  for (const row of list) {
    const full = await getSachbuchKontext(row.id);
    if (!full) continue;
    if (
      full.idee.edition === "compact" &&
      (full.idee.sourceBookId === FULL_ID ||
        /kompakt/i.test(full.title) ||
        /kompakt/i.test(full.export.suggestedTitle))
    ) {
      return full.id;
    }
  }
  return null;
}

async function main() {
  const compactId = await findCompactId();
  if (!compactId) throw new Error("Keine Kompakt-Ausgabe gefunden.");
  const book = await getSachbuchKontext(compactId);
  if (!book) throw new Error("Kompakt-Buch nicht ladbar.");
  const sourceId = book.idee.sourceBookId?.trim() || FULL_ID;
  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error("Hauptbuch nicht gefunden.");

  const copy = buildSachbuchCompactEditionCopy(source);
  const autor =
    book.export.autorName.trim() ||
    source.export.autorName.trim() ||
    source.export.vorsatz.titelseite.autor.trim();
  const year =
    source.export.vorsatz.impressum.jahr.trim() ||
    String(new Date().getFullYear());
  const title =
    book.export.suggestedTitle.trim() ||
    book.title.trim() ||
    `${source.title} — Kompakt`;

  await upsertSachbuchExport({
    id: compactId,
    suggestedTitle: title,
    subtitle: copy.subtitle,
    summary: copy.summary,
    keywords: copy.keywords,
    autorName: autor,
    vorsatz: {
      ...book.export.vorsatz,
      titelseite: {
        titel: title,
        untertitel: copy.subtitle,
        autor,
        imprint: SACHBUCH_DEFAULT_IMPRINT,
      },
      impressum: buildSachbuchImpressum({
        jahr: year,
        autorPseudonym: autor,
      }),
      motto: copy.motto,
      vorwort: copy.vorwort,
      widmung: "",
    },
  });

  const done = await getSachbuchKontext(compactId);
  console.log(
    JSON.stringify(
      {
        id: compactId,
        subtitle: done!.export.subtitle,
        motto: done!.export.vorsatz.motto.slice(0, 80),
        vorwortStart: done!.export.vorsatz.vorwort.slice(0, 160),
        summaryStart: done!.export.summary.slice(0, 160),
        imprint: done!.export.vorsatz.titelseite.imprint,
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
