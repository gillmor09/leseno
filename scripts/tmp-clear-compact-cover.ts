/**
 * Clear cover image on the Privacy Value Thinking Kompakt edition.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-clear-compact-cover.ts
 */
import {
  getSachbuchKontext,
  listSachbuchKontexte,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const list = await listSachbuchKontexte();
  let compactId: string | null = null;
  for (const row of list) {
    const full = await getSachbuchKontext(row.id);
    if (!full) continue;
    if (
      full.idee.edition === "compact" &&
      (full.idee.sourceBookId === FULL_ID || /kompakt/i.test(full.title))
    ) {
      compactId = full.id;
      break;
    }
  }
  if (!compactId) throw new Error("Kompakt-Ausgabe nicht gefunden.");

  const before = await getSachbuchKontext(compactId);
  const hadCover = Boolean(before?.export.coverImageDataUrl?.trim());

  await upsertSachbuchExport({
    id: compactId,
    coverImageDataUrl: "",
    coverPrompt: "",
  });

  const after = await getSachbuchKontext(compactId);
  console.log(
    JSON.stringify(
      {
        id: compactId,
        title: after?.title,
        hadCover,
        coverCleared: !(after?.export.coverImageDataUrl ?? "").trim(),
        promptCleared: !(after?.export.coverPrompt ?? "").trim(),
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
