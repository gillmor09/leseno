/**
 * PDF / ePub builders for greenfield novels — reuse roman export engines.
 * PDF: cover + Titelei. ePub: Titelei only (no cover image).
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
import type { NovelBundle } from "@/lib/novel/types";

export function novelExportChapters(
  bundle: NovelBundle,
): RomanExportChapter[] {
  return bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => ({
      number: c.chapterNumber,
      title: c.title || `Kapitel ${c.chapterNumber}`,
      body: (c.finalText || c.rawDraft).trim(),
    }))
    .filter((c) => c.body.length >= 40);
}

function resolveVorsatz(bundle: NovelBundle): RomanVorsatz {
  const base = parseVorsatzJson(bundle.novel.vorsatz ?? emptyVorsatz());
  const autor =
    bundle.novel.autorName?.trim() || base.titelseite.autor;
  return {
    ...base,
    titelseite: {
      ...base.titelseite,
      titel: base.titelseite.titel.trim() || bundle.novel.title,
      untertitel:
        base.titelseite.untertitel.trim() ||
        bundle.novel.subtitle.trim(),
      autor,
    },
  };
}

export async function buildNovelPdfBlob(
  bundle: NovelBundle,
): Promise<{ blob: Blob; filename: string }> {
  const chapters = novelExportChapters(bundle);
  if (!chapters.length) {
    throw new Error("Noch kein Manuskript-Text zum PDF-Export.");
  }
  const blob = await buildRomanPdfBlob({
    title: bundle.novel.title,
    chapters,
    coverImageDataUrl: bundle.novel.coverImageDataUrl || undefined,
    vorsatz: resolveVorsatz(bundle),
  });
  return { blob, filename: romanPdfFilename(bundle.novel.title) };
}

/** ePub without cover image; Titelei (Vorsatz) included. */
export async function buildNovelEpubBlob(
  bundle: NovelBundle,
): Promise<{ blob: Blob; filename: string }> {
  const chapters = novelExportChapters(bundle);
  if (!chapters.length) {
    throw new Error("Noch kein Manuskript-Text zum ePub-Export.");
  }
  const vorsatz = resolveVorsatz(bundle);
  const blob = await buildRomanEpubBlob({
    title: bundle.novel.title,
    autorName:
      vorsatz.titelseite.autor.trim() ||
      bundle.novel.autorName.trim() ||
      "Autor:in",
    chapters,
    // Explicitly omit cover for storefront packaging preference.
    coverImageDataUrl: undefined,
    vorsatz,
  });
  return { blob, filename: romanEpubFilename(bundle.novel.title) };
}
