/**
 * Remove Kap.9 Werkzeugkasten heading + download CTA; keep conceptual close.
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText, countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[8]!;
  const before = sachbuchKapitelBodyText(k);

  const toolkit = "Ihr Werkzeugkasten für den sofortigen Start";
  const conceptual = "Unternehmen, die diesen Weg gehen, beenden den zermürbenden Stellungskrieg";
  const download = "Sie müssen für diesen Wandel keine neuen Gesetzeskommentare wälzen";

  const tIdx = before.indexOf(toolkit);
  const cIdx = before.indexOf(conceptual);
  const dIdx = before.indexOf(download);

  console.log({ tIdx, cIdx, dIdx });
  if (tIdx < 0 || cIdx < 0) throw new Error("expected markers missing");

  // head up to toolkit heading, then conceptual para only (drop download after it)
  let conceptualPara = before.slice(cIdx);
  if (dIdx > cIdx) {
    conceptualPara = before.slice(cIdx, dIdx).replace(/\s+$/g, "");
  } else {
    // if download not found, take first para only
    const end = conceptualPara.indexOf("\n\n");
    if (end > 0) conceptualPara = conceptualPara.slice(0, end);
  }

  const text = `${before.slice(0, tIdx).replace(/\s+$/g, "")}\n\n${conceptualPara}\n`;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
    },
    finalText: text,
    updatedAt: now,
  });
  console.log(
    JSON.stringify({
      wordsBefore: countSachbuchWords(before),
      wordsAfter: countSachbuchWords(text),
      last: conceptualPara.slice(0, 180).replace(/\s+/g, " "),
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
