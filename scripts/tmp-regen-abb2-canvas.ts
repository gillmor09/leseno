/**
 * Regenerate Abbildung 2 (Privacy Solution Canvas) only.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-regen-abb2-canvas.ts
 */
import {
  generateSachbuchKapitelInfografik,
  sachbuchInfografikBriefsForBook,
  sachbuchKapitelInfografiken,
} from "../src/lib/sachbuch/infografik";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");
  const brief = sachbuchInfografikBriefsForBook(book).find(
    (b) => b.key === "abb-2",
  );
  if (!brief) throw new Error("Brief abb-2 fehlt");
  const kap = book.kapitel[brief.kapitelIndex];
  if (!kap) throw new Error("Kapitel fehlt");

  console.log("Erzeuge", brief.title, "…");
  const next = await generateSachbuchKapitelInfografik({
    sachbuchId: ID,
    kapitelId: kap.id,
    brief,
  });
  const hit = sachbuchKapitelInfografiken(next.kapitel[0]!).find(
    (i) => i.key === "abb-2" || i.title.includes("Privacy Solution Canvas"),
  );
  console.log(
    JSON.stringify(
      {
        ok: Boolean(hit?.dataUrl?.startsWith("data:image/")),
        title: hit?.title,
        key: hit?.key,
        kb: hit ? Math.round(hit.dataUrl.length / 1024) : 0,
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
