/**
 * Build both Sachbuch ePubs: ohne Cover (Veröffentlichung) + mit Cover.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-export-sachbuch-epub.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSachbuchEpubBlob } from "../src/lib/sachbuch/export-build";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function writeOne(
  book: NonNullable<Awaited<ReturnType<typeof getSachbuchKontext>>>,
  includeCover: boolean,
  outDir: string,
) {
  const { blob, filename } = await buildSachbuchEpubBlob(book, {
    includeCover,
  });
  const outPath = path.join(outDir, filename);
  const buf = Buffer.from(await blob.arrayBuffer());
  await writeFile(outPath, buf);
  return {
    includeCover,
    filename,
    outPath,
    mb: Number((buf.length / (1024 * 1024)).toFixed(2)),
  };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  const outDir = path.join(process.cwd(), "exports");
  await mkdir(outDir, { recursive: true });

  const ohne = await writeOne(book, false, outDir);
  console.log("ohne Cover:", ohne);
  const mit = await writeOne(book, true, outDir);
  console.log("mit Cover:", mit);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
