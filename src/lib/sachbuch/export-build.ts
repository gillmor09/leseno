/**
 * PDF / ePub builders for Sachbuch — reuse roman export engines.
 * PDF: Titelei (Titelseite = S.1, Impressum = S.2) + Kapitel — ohne Cover
 * (Cover separat für Tolino Print).
 * ePub: Titelei inkl. Impressum; Cover optional (`includeCover`) —
 * ohne Cover = Veröffentlichungsdatei, mit Cover = Vorschau/Paket.
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
import {
  buildSachbuchImpressum,
  SACHBUCH_DEFAULT_AUTHOR,
  SACHBUCH_DEFAULT_IMPRINT,
} from "@/lib/sachbuch/impressum";
import { sachbuchFiguresFromList } from "@/lib/sachbuch/figures";
import {
  sachbuchKapitelExportBody,
  sachbuchKapitelInfografiken,
} from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import { isSachbuchDerivedEdition } from "@/lib/sachbuch/guide";

/** Kapitel with enough prose for export (Herstellung → Manuskript → Abschnitte). */
export function sachbuchExportChapters(
  book: SachbuchKontext,
): RomanExportChapter[] {
  /** Kompakt / Teaser: text-only — never embed chapter graphics. */
  const allowFigures = !isSachbuchDerivedEdition(book);
  return book.kapitel
    .map((k, i) => {
      const body = sachbuchKapitelExportBody(k);
      const figures = allowFigures
        ? sachbuchFiguresFromList(sachbuchKapitelInfografiken(k))
        : [];
      const infos = figures.map((x) => x.dataUrl);
      return {
        number: i + 1,
        title: k.title.trim() || `Kapitel ${i + 1}`,
        body,
        infografikDataUrl: infos[0] ?? null,
        infografikDataUrls: infos,
        sachbuchFigures: figures.map((f) => ({
          key: f.key,
          title: f.title,
          dataUrl: f.dataUrl,
        })),
      };
    })
    .filter((c) => c.body.length >= 40);
}

function resolveVorsatz(book: SachbuchKontext): RomanVorsatz {
  const base = parseVorsatzJson(book.export.vorsatz ?? emptyVorsatz());
  const autor = SACHBUCH_DEFAULT_AUTHOR;
  const title =
    base.titelseite.titel.trim() ||
    book.export.suggestedTitle.trim() ||
    book.title.trim();
  const year =
    base.impressum.jahr.trim() || String(new Date().getFullYear());
  // Always inject Tolino-ready Impressum (Klarname / Anschrift / KI / Auflage).
  const impressum = buildSachbuchImpressum({
    jahr: year,
    autorPseudonym: autor,
  });
  return {
    ...base,
    titelseite: {
      ...base.titelseite,
      titel: title,
      untertitel:
        base.titelseite.untertitel.trim() ||
        book.export.subtitle.trim(),
      autor,
      // Always use Privacy-Value imprint (not stored leseno.de leftovers).
      imprint: SACHBUCH_DEFAULT_IMPRINT,
    },
    impressum,
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
    // Tolino Print: Innendatei ohne Cover → Titelseite S.1, Impressum S.2.
    // Cover separat aus dem Export-Tab herunterladen / hochladen.
    coverImageDataUrl: undefined,
    vorsatz: resolveVorsatz(book),
    /** Smaller body/heading than Roman trade PDF (11/13 pt vs 14/16). */
    printDensity: "compact",
  });
  return { blob, filename: romanPdfFilename(title) };
}

/**
 * ePub + Titelei. `includeCover: false` → Veröffentlichungsdatei (Tolino).
 * `includeCover: true` → gleiche Datei plus Cover-Bild im Package.
 */
export async function buildSachbuchEpubBlob(
  book: SachbuchKontext,
  options: { includeCover?: boolean } = {},
): Promise<{ blob: Blob; filename: string }> {
  const includeCover = Boolean(options.includeCover);
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
  const cover = (book.export.coverImageDataUrl ?? "").trim();
  if (includeCover && !cover.startsWith("data:image/")) {
    throw new Error(
      "Kein Cover gespeichert — zuerst Cover erzeugen oder ohne Cover exportieren.",
    );
  }
  const blob = await buildRomanEpubBlob({
    title,
    autorName:
      vorsatz.titelseite.autor.trim() ||
      book.export.autorName.trim() ||
      "Autor:in",
    chapters,
    coverImageDataUrl: includeCover ? cover : undefined,
    vorsatz,
  });
  const base = romanEpubFilename(title);
  const filename = includeCover
    ? base.replace(/\.epub$/i, "-mit-Cover.epub")
    : base;
  return { blob, filename };
}
