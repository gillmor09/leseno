/**
 * PDF / ePub builders for Sachbuch — reuse roman export engines.
 * PDF: cover + Titelei + Kapitel. ePub: Titelei only (no cover image).
 */

import {
  buildRomanEpubBlob,
  romanEpubFilename,
} from "@/lib/roman/export-roman-epub";
import {
  buildRomanPdfBlob,
  romanPdfFilename,
  type RomanExportChapter,
} from "@/lib/roman/export-roman-pdf";
import {
  emptyVorsatz,
  parseVorsatzJson,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import { sachbuchKapitelBodyText } from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";

/** Kapitel with enough prose for export (Manuskript → Abschnitte → finalText). */
export function sachbuchExportChapters(
  book: SachbuchKontext,
): RomanExportChapter[] {
  return book.kapitel
    .map((k, i) => {
      const body = sachbuchKapitelBodyText(k);
      return {
        number: i + 1,
        title: k.title.trim() || `Kapitel ${i + 1}`,
        body,
      };
    })
    .filter((c) => c.body.length >= 40);
}

function resolveVorsatz(book: SachbuchKontext): RomanVorsatz {
  const base = parseVorsatzJson(book.export.vorsatz ?? emptyVorsatz());
  const autor =
    book.export.autorName?.trim() || base.titelseite.autor;
  const title =
    base.titelseite.titel.trim() ||
    book.export.suggestedTitle.trim() ||
    book.title.trim();
  return {
    ...base,
    titelseite: {
      ...base.titelseite,
      titel: title,
      untertitel:
        base.titelseite.untertitel.trim() ||
        book.export.subtitle.trim(),
      autor,
    },
  };
}

export async function buildSachbuchPdfBlob(
  book: SachbuchKontext,
): Promise<{ blob: Blob; filename: string }> {
  const chapters = sachbuchExportChapters(book);
  if (!chapters.length) {
    throw new Error(
      "Noch kein Kapiteltext zum PDF-Export — zuerst Abschnitte schreiben.",
    );
  }
  const title =
    book.export.suggestedTitle.trim() || book.title.trim() || "Sachbuch";
  const blob = await buildRomanPdfBlob({
    title,
    chapters,
    coverImageDataUrl: book.export.coverImageDataUrl || undefined,
    vorsatz: resolveVorsatz(book),
    /** Smaller body/heading than Roman trade PDF (11/13 pt vs 14/16). */
    printDensity: "compact",
  });
  return { blob, filename: romanPdfFilename(title) };
}

/** ePub without cover image; Titelei (Vorsatz) included. */
export async function buildSachbuchEpubBlob(
  book: SachbuchKontext,
): Promise<{ blob: Blob; filename: string }> {
  const chapters = sachbuchExportChapters(book);
  if (!chapters.length) {
    throw new Error(
      "Noch kein Kapiteltext zum ePub-Export — zuerst Abschnitte schreiben.",
    );
  }
  const vorsatz = resolveVorsatz(book);
  const title =
    vorsatz.titelseite.titel.trim() ||
    book.export.suggestedTitle.trim() ||
    book.title.trim() ||
    "Sachbuch";
  const blob = await buildRomanEpubBlob({
    title,
    autorName:
      vorsatz.titelseite.autor.trim() ||
      book.export.autorName.trim() ||
      "Autor:in",
    chapters,
    coverImageDataUrl: undefined,
    vorsatz,
  });
  return { blob, filename: romanEpubFilename(title) };
}
