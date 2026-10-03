/**
 * Loads a whitelisted Clever-erzählt roman for the Buch-der-Woche landing
 * (read-only HTML, no PDF). Entries come from DB; details from Infografiken.
 */

import {
  getBuchDerWocheEntry,
  getCurrentBuchDerWocheEntry,
} from "@/lib/buch-der-woche/repository";
import type { BuchDerWocheEntry } from "@/lib/buch-der-woche/types";
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
  coverDisplaySrc: string | null;
  heroBackdropSrc: string | null;
  detailASrc: string | null;
  detailBSrc: string | null;
  previewHtml: string;
};

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

function pickDetailInfografiken(
  unterthemen: { kapitel?: Array<{ nummer: number; infografikDataUrl?: string | null }> } | null | undefined,
): { detailA: string | null; detailB: string | null } {
  const kapitel = [...(unterthemen?.kapitel ?? [])]
    .filter((k) => (k.infografikDataUrl ?? "").startsWith("data:image/"))
    .sort((a, b) => a.nummer - b.nummer);
  if (kapitel.length === 0) return { detailA: null, detailB: null };
  const detailA = kapitel[0]?.infografikDataUrl?.trim() || null;
  const mid = kapitel[Math.min(kapitel.length - 1, Math.floor(kapitel.length / 2))];
  const detailB =
    kapitel.length > 1
      ? mid?.infografikDataUrl?.trim() || null
      : null;
  return { detailA, detailB };
}

async function bookFromEntry(
  entry: BuchDerWocheEntry,
): Promise<BuchDerWocheBook | null> {
  const roman = await getRomanKontext(entry.romanId);
  if (!roman) return null;
  if (roman.editorial.buchTyp !== "clever_erzaehlt") return null;

  const chapters = collectExportChaptersFromEditorial(roman.editorial);
  if (chapters.length === 0) return null;

  const cover = (roman.coverImageDataUrl ?? "").trim();
  const hasCover = cover.startsWith("data:image/");
  const { detailA, detailB } = pickDetailInfografiken(
    roman.editorial.cleverUnterthemen,
  );
  const coverDisplaySrc = hasCover ? cover : detailA;
  const heroBackdropSrc = coverDisplaySrc;

  const previewHtml = withReadOnlyProtection(
    buildRomanExportDocument({
      title: roman.title,
      chapters,
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
    hasCover,
    coverImageDataUrl: cover,
    coverDisplaySrc,
    heroBackdropSrc,
    detailASrc: detailA,
    detailBSrc: detailB,
    previewHtml,
  };
}

/** Current live week for `/buch-der-woche`. */
export async function loadCurrentBuchDerWocheBook(): Promise<BuchDerWocheBook | null> {
  const entry = await getCurrentBuchDerWocheEntry();
  if (!entry) return null;
  return bookFromEntry(entry);
}

/**
 * Loads whitelist slug → Clever roman → export HTML.
 * Returns null when the slug is unknown or the roman is missing / not Clever.
 */
export async function loadBuchDerWocheBook(
  slug: string,
): Promise<BuchDerWocheBook | null> {
  const entry = await getBuchDerWocheEntry(slug);
  if (!entry) return null;
  return bookFromEntry(entry);
}
