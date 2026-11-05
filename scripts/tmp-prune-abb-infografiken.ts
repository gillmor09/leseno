/**
 * Drop Infografiken whose titles are not current Abbildung briefs.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-prune-abb-infografiken.ts
 */
import {
  sachbuchInfografikBriefsForBook,
  sachbuchKapitelInfografiken,
} from "../src/lib/sachbuch/infografik";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const briefs = sachbuchInfografikBriefsForBook(book);

  for (let i = 0; i < book.kapitel.length; i++) {
    const kap = book.kapitel[i]!;
    const chapterBriefs = briefs.filter((b) => b.kapitelIndex === i);
    const allowed = new Set(chapterBriefs.map((b) => b.title.trim()));
    const before = sachbuchKapitelInfografiken(kap);
    const after = before
      .filter((x) => allowed.has(x.title.trim()))
      .sort((a, b) => {
        const ia = chapterBriefs.findIndex((x) => x.title === a.title);
        const ib = chapterBriefs.findIndex((x) => x.title === b.title);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    const dropped = before
      .filter((x) => !allowed.has(x.title.trim()))
      .map((x) => x.title);

    if (dropped.length === 0 && after.length === before.length) {
      console.log(`K${i + 1}: ok (${after.length})`);
      continue;
    }

    const first = after[0];
    await patchSachbuchKapitel(ID, kap.id, {
      infografiken: after,
      infografikDataUrl: first?.dataUrl ?? null,
      infografikTitle: first?.title ?? "",
      infografikPrompt: first?.prompt ?? "",
      updatedAt: new Date().toISOString(),
    });
    console.log(
      `K${i + 1}: kept ${after.length}, dropped: ${dropped.join(" | ") || "(none)"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
