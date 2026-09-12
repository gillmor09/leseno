/**
 * Extract plain text from a PDF buffer for the roman manuscript field.
 */

import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_PDF_BYTES = 12 * 1024 * 1024;

/**
 * Returns merged page text from a PDF. Throws German errors for the admin UI.
 */
export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer | Uint8Array,
): Promise<{ text: string; pageCount: number }> {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.byteLength === 0) {
    throw new Error("PDF-Datei ist leer.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF ist zu groß (max. 12 MB).");
  }

  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = (typeof text === "string" ? text : String(text ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (merged.length < 40) {
    throw new Error(
      "Aus dem PDF konnte kaum Text gelesen werden (gescanntes PDF ohne OCR?).",
    );
  }

  return { text: merged, pageCount: totalPages };
}
