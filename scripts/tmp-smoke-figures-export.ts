/**
 * Smoke: export chapters have figures; PDF/ePub build includes images.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSachbuchEpubBlob,
  buildSachbuchPdfBlob,
  sachbuchExportChapters,
} from "../src/lib/sachbuch/export-build";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const chapters = sachbuchExportChapters(book);
  for (const c of chapters) {
    const n = c.sachbuchFigures?.length ?? 0;
    if (!n) continue;
    console.log(
      `ch${c.number}: ${n} figures → ${c.sachbuchFigures!.map((f) => f.key).join(", ")}`,
    );
  }

  const outDir = path.join(process.cwd(), "exports");
  await mkdir(outDir, { recursive: true });

  const pdf = await buildSachbuchPdfBlob(book);
  const pdfBuf = Buffer.from(await pdf.blob.arrayBuffer());
  await writeFile(path.join(outDir, pdf.filename), pdfBuf);
  console.log("PDF", pdf.filename, `${(pdfBuf.length / 1024 / 1024).toFixed(2)} MB`);

  const epub = await buildSachbuchEpubBlob(book, { includeCover: false });
  const epubBuf = Buffer.from(await epub.blob.arrayBuffer());
  await writeFile(path.join(outDir, epub.filename), epubBuf);
  console.log("ePub", epub.filename, `${(epubBuf.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
