/**
 * Loads a whitelisted Clever-erzählt roman and builds read-only export HTML
 * for the Instagram „Buch der Woche“ landing (no PDF download).
 */

import {
  getBuchDerWocheEntry,
  type BuchDerWocheEntry,
} from "@/lib/buch-der-woche/catalog";
import {
  buildRomanExportDocument,
  collectExportChaptersFromEditorial,
} from "@/lib/roman/export-roman-pdf";
import { getRomanKontext } from "@/lib/roman/repository";

export type BuchDerWocheBook = {
  entry: BuchDerWocheEntry;
  title: string;
  einzeiler: string;
  klappentext: string;
  zielAlterMin: number | null;
  zielAlterMax: number | null;
  chapterCount: number;
  hasCover: boolean;
  coverImageDataUrl: string;
  /** Self-contained HTML for the inline reader iframe. */
  previewHtml: string;
};

/**
 * Soft copy protection CSS injected into the export HTML (UX deterrent only).
 */
const READ_ONLY_PROTECTION_CSS = `
  html, body {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
  }
  img {
    -webkit-user-drag: none !important;
    pointer-events: none !important;
  }
  a { pointer-events: auto; }
`;

function withReadOnlyProtection(html: string): string {
  const styleTag = `<style id="leseno-readonly">${READ_ONLY_PROTECTION_CSS}</style>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${styleTag}</head>`);
  }
  return `${styleTag}${html}`;
}

/**
 * Loads catalog slug → Clever roman → export HTML for inline reading.
 * Returns null when the slug is unknown or the roman is missing / not Clever.
 */
export async function loadBuchDerWocheBook(
  slug: string,
): Promise<BuchDerWocheBook | null> {
  const entry = getBuchDerWocheEntry(slug);
  if (!entry) return null;

  const roman = await getRomanKontext(entry.romanId);
  if (!roman) return null;
  if (roman.editorial.buchTyp !== "clever_erzaehlt") return null;

  const chapters = collectExportChaptersFromEditorial(roman.editorial);
  if (chapters.length === 0) return null;

  const cover = (roman.coverImageDataUrl ?? "").trim();
  const previewHtml = withReadOnlyProtection(
    buildRomanExportDocument({
      title: roman.title,
      chapters,
      coverImageDataUrl: cover || undefined,
      vorsatz: roman.vorsatz,
    }),
  );

  return {
    entry,
    title: roman.title.trim() || entry.slug,
    einzeiler: (roman.editorial.einzeiler ?? "").trim(),
    klappentext: (roman.editorial.klappentext ?? "").trim(),
    zielAlterMin: roman.editorial.zielAlterMin,
    zielAlterMax: roman.editorial.zielAlterMax,
    chapterCount: chapters.length,
    hasCover: cover.startsWith("data:image/"),
    coverImageDataUrl: cover,
    previewHtml,
  };
}
