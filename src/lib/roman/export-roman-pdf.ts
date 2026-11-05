/**
 * Admin roman export: HTML preview + text PDF (jsPDF + embedded Nunito).
 * Trade paperback 6×9 in. Order: optional cover → front matter → chapters
 * (prose → optional Clever Infografik with edge inset → Abenteuer-Wissen card).
 */

import { jsPDF } from "jspdf";
import {
  NUNITO_FONT_FAMILY,
  nunitoExportFontCss,
  nunitoGoogleFontsLinkTag,
} from "@/lib/pdf/export-font";
import { ensureNunitoOnPdf, setNunito } from "@/lib/pdf/jspdf-nunito";
import {
  abenteuerWissenExportLines,
  stripErzaehlerWrappers,
} from "@/lib/roman/clever-geschichte";
import type {
  CleverUnterthemen,
  RomanEditorial,
} from "@/lib/roman/editorial";
import {
  emptyVorsatz,
  hasUsableVorsatz,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import {
  formatManuskriptChapterHeading,
  isSceneBreakParagraph,
  parsePlotChapters,
  SCENE_BREAK_MARKER,
  stripLeadingChapterHeadings,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import type { Szene } from "@/lib/roman/types";
import {
  sachbuchFigureByKey,
  sachbuchFigurePrefersFullPage,
  splitProseAroundFigureCaption,
  stripKnownFigureCaptions,
  type SachbuchFigure,
} from "@/lib/sachbuch/figures";
import {
  hasSachbuchLayoutMarkup,
  parseSachbuchLayoutBlocks,
  sachbuchBoxChromeTitle,
  splitSachbuchProseLeadingSubtitle,
  type SachbuchLayoutBlock,
} from "@/lib/sachbuch/herstellung-markup";
import {
  SACHBUCH_IMPRESSUM_PRINT_BOTTOM_MM,
  SACHBUCH_IMPRESSUM_PRINT_TOP_MM,
} from "@/lib/sachbuch/impressum";

export type RomanExportScene = Pick<
  Szene,
  "kapitelNr" | "szenenNr" | "entwurfRevidiert" | "status"
>;

/** One print chapter for PDF / EPUB (from Manuskript or grouped scenes). */
export type RomanExportChapter = {
  number: number;
  title: string;
  body: string;
  /**
   * Clever erzählt / Sachbuch: full-page Infografik after prose
   * (legacy single; prefer `infografikDataUrls` when set).
   */
  infografikDataUrl?: string | null;
  /** Sachbuch: multiple Abbildung pages after chapter prose (fallback). */
  infografikDataUrls?: string[];
  /**
   * Sachbuch figures keyed to Abbildung/Tabelle captions — placed inline
   * in Herstellung markup; unused ones still append after the chapter.
   */
  sachbuchFigures?: Array<{
    key: string;
    title: string;
    dataUrl: string;
  }>;
  /** Clever erzählt: numbered takeaways after the infographic. */
  abenteuerWissenFakten?: string[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugifyFilename(title: string): string {
  const base = title
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "roman";
}

/** Scenes that have a non-empty revised draft, in reading order. */
export function collectRevisedScenes(
  szenen: RomanExportScene[],
): RomanExportScene[] {
  return [...szenen]
    .filter((s) => s.entwurfRevidiert.trim().length > 0)
    .sort(
      (a, b) =>
        a.kapitelNr - b.kapitelNr || a.szenenNr - b.szenenNr,
    );
}

/**
 * Chapters with prose from `editorial.manuskriptText` (print-style headings).
 */
export function collectManuskriptExportChapters(
  manuskriptText: string,
): RomanExportChapter[] {
  return parsePlotChapters(manuskriptText)
    .map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      body: stripLeadingChapterHeadings(chapter.body, chapter.number).trim(),
    }))
    .filter((chapter) => chapter.body.length > 0);
}

/**
 * Clever: attach Infografik + Abenteuer-Wissen (order: prose → image → list).
 * Strips any legacy Abenteuer-Wissen block from prose.
 */
export function enrichCleverExportChapters(
  chapters: RomanExportChapter[],
  unterthemen: CleverUnterthemen | null | undefined,
): RomanExportChapter[] {
  if (!unterthemen?.kapitel.length) {
    return chapters.map((c) => ({
      ...c,
      body: stripErzaehlerWrappers(c.body).trim(),
    }));
  }
  const byNum = new Map(unterthemen.kapitel.map((k) => [k.nummer, k]));
  return chapters.map((c) => {
    const kap = byNum.get(c.number);
    const fakten = (kap?.fakten ?? [])
      .map((f) => f.trim())
      .filter((f) => f.length >= 3);
    const url = kap?.infografikDataUrl?.trim() ?? "";
    const cleanTitle = (kap?.titel ?? c.title).trim();
    return {
      ...c,
      title: cleanTitle || c.title,
      body: stripErzaehlerWrappers(c.body).trim(),
      infografikDataUrl: url.startsWith("data:image/") ? url : null,
      abenteuerWissenFakten: fakten,
    };
  });
}

/** Manuskript chapters, with Clever extras when `buchTyp === clever_erzaehlt`. */
/** Which prose document to export (Belletristik). Clever always uses Manuskript. */
export type RomanExportProseSource = "manuskript" | "roman";

export function collectExportChaptersFromEditorial(
  editorial: Pick<
    RomanEditorial,
    "buchTyp" | "manuskriptText" | "romanText" | "cleverUnterthemen"
  >,
  options?: { source?: RomanExportProseSource },
): RomanExportChapter[] {
  const source: RomanExportProseSource =
    editorial.buchTyp === "clever_erzaehlt"
      ? "manuskript"
      : (options?.source ?? "manuskript");
  const prose =
    source === "roman"
      ? (editorial.romanText ?? "")
      : (editorial.manuskriptText ?? "");
  const base = collectManuskriptExportChapters(prose);
  if (editorial.buchTyp !== "clever_erzaehlt") return base;
  return enrichCleverExportChapters(base, editorial.cleverUnterthemen);
}

function chaptersFromRevisedScenes(
  szenen: RomanExportScene[],
): RomanExportChapter[] {
  const revised = collectRevisedScenes(szenen);
  const byChapter = new Map<number, string[]>();
  for (const scene of revised) {
    const list = byChapter.get(scene.kapitelNr) ?? [];
    list.push(scene.entwurfRevidiert.trim());
    byChapter.set(scene.kapitelNr, list);
  }
  return [...byChapter.entries()].map(([number, bodies]) => ({
    number,
    title: "",
    body: bodies.join("\n\n"),
  }));
}

/** Prefer explicit chapters; fall back to legacy revised scenes. */
export function resolveExportChapters(input: {
  chapters?: RomanExportChapter[];
  szenen?: RomanExportScene[];
}): RomanExportChapter[] {
  if (input.chapters?.length) {
    return input.chapters.filter((c) => c.body.trim().length > 0);
  }
  if (input.szenen?.length) {
    return chaptersFromRevisedScenes(input.szenen);
  }
  return [];
}

function chapterHeadingLabel(chapter: RomanExportChapter): string {
  return formatManuskriptChapterHeading({
    number: chapter.number,
    title: chapter.title,
    body: "",
  } satisfies PlotChapter);
}

function paragraphsToHtml(text: string): string {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map((p) =>
      isSceneBreakParagraph(p)
        ? `<p class="scene-break">${escapeHtml(SCENE_BREAK_MARKER)}</p>`
        : `<p>${escapeHtml(p).replaceAll("\n", "<br />")}</p>`,
    )
    .join("\n");
}

function paragraphsPlain(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Strip leading "1. " from export lines for icon bullets. */
function factPlainText(line: string): string {
  return line.replace(/^\d+\.\s*/, "").trim();
}

export type RomanExportTypographyHints = {
  zielAlterMin?: number | null;
  zielAlterMax?: number | null;
  buchTyp?: string | null;
};

export type RomanExportInput = {
  title: string;
  /** Manuskript chapters (preferred). */
  chapters?: RomanExportChapter[];
  /** Legacy: revised scenes grouped into chapters. */
  szenen?: RomanExportScene[];
  /** Total scene count (unused in body; kept for callers). */
  totalSzenen?: number;
  /** Optional Flux cover data URL (first full-bleed page). */
  coverImageDataUrl?: string;
  /** Minimal eBook front matter after cover, before chapter 1. */
  vorsatz?: RomanVorsatz;
  /**
   * Age / book-type hints for print typography.
   * Adult + YA: normal glyph spacing; children / Clever: wider (~1.1×).
   */
  typography?: RomanExportTypographyHints;
  /**
   * Body/heading point sizes. `compact` = smaller text (Sachbuch PDF).
   * Default keeps Roman trade sizes (14 / 16 pt).
   */
  printDensity?: "default" | "compact";
};

type PdfTypeScale = {
  bodyPt: number;
  /** Unterkapitel / Zwischenüberschrift. */
  headingPt: number;
  /** Chapter title (Kapitel 1 …) — one step above Unterkapitel. */
  chapterTitlePt: number;
  bodyLineMm: number;
  headingLineMm: number;
  chapterTitleLineMm: number;
  tocLineMm: number;
  /** Front-matter title / subtitle / autor sizes. */
  fmTitlePt: number;
  fmSubtitlePt: number;
  fmAutorPt: number;
};

/**
 * Wider letter-spacing for children's / early-reader print.
 * Adult (`min ≥ 18`) and YA (`min ≥ 14`) keep normal advance — trade look.
 */
export function romanExportUsesWideCharSpacing(
  hints?: RomanExportTypographyHints | null,
): boolean {
  if (!hints) return false;
  if (hints.buchTyp === "clever_erzaehlt") return true;
  const min = hints.zielAlterMin ?? null;
  const max = hints.zielAlterMax ?? null;
  if (min != null && min >= 18) return false;
  if (max != null && max < 18) return true;
  if (min != null && min >= 14) return false;
  return false;
}

/** Body 14 pt / chapter 16 pt bold; line-height 1.5; kids char advance ×1.1. */
const PDF_BODY_PT = 14;
const PDF_HEADING_PT = 16;
const PDF_LINE_HEIGHT = 1.5;
/** Inhaltsverzeichnis entry rhythm (2 × body size). */
const PDF_TOC_LINE_HEIGHT = 2;
/** Extra inter-glyph space for children's books only (~1.1× normal). */
const PDF_CHAR_SCALE_WIDE = 1.1;
const PT_TO_MM = 25.4 / 72;

function pdfLineHeightMm(sizePt: number): number {
  return sizePt * PDF_LINE_HEIGHT * PT_TO_MM;
}

/** Resolve body/heading sizes for PDF (compact = Sachbuch). */
function resolvePdfTypeScale(
  density?: RomanExportInput["printDensity"],
): PdfTypeScale {
  if (density === "compact") {
    const bodyPt = 11;
    /** Clearly above body so Unterkapitel read as section starts. */
    const headingPt = 15;
    /** Kapitelüberschrift — one step above Unterkapitel. */
    const chapterTitlePt = 18;
    return {
      bodyPt,
      headingPt,
      chapterTitlePt,
      bodyLineMm: pdfLineHeightMm(bodyPt),
      headingLineMm: pdfLineHeightMm(headingPt),
      chapterTitleLineMm: pdfLineHeightMm(chapterTitlePt),
      tocLineMm: bodyPt * PDF_TOC_LINE_HEIGHT * PT_TO_MM,
      fmTitlePt: 16,
      fmSubtitlePt: 11,
      fmAutorPt: 12,
    };
  }
  const chapterTitlePt = PDF_HEADING_PT + 2;
  return {
    bodyPt: PDF_BODY_PT,
    headingPt: PDF_HEADING_PT,
    chapterTitlePt,
    bodyLineMm: pdfLineHeightMm(PDF_BODY_PT),
    headingLineMm: pdfLineHeightMm(PDF_HEADING_PT),
    chapterTitleLineMm: pdfLineHeightMm(chapterTitlePt),
    tocLineMm: PDF_BODY_PT * PDF_TOC_LINE_HEIGHT * PT_TO_MM,
    fmTitlePt: 19,
    fmSubtitlePt: 12,
    fmAutorPt: 13,
  };
}

/** Wrap width shrunk when wide char-spacing is active so lines still fit. */
function pdfWrapWidthMm(contentWidthMm: number, charScale: number): number {
  return contentWidthMm / charScale;
}

/**
 * Sets jsPDF Tc so average glyph advance matches `charScale` (1 = normal).
 * Call after `setNunito` (font size must already be active).
 */
function applyPdfCharSpacing(pdf: jsPDF, charScale: number): void {
  pdf.setCharSpace(0);
  if (charScale <= 1) return;
  const sample = "abcdefghijklmnopqrstuvwxyzäöüß";
  const avgMm = pdf.getTextWidth(sample) / sample.length;
  pdf.setCharSpace(avgMm * (charScale - 1));
}

function clearPdfCharSpacing(pdf: jsPDF): void {
  pdf.setCharSpace(0);
}

const PDF_BODY_LINE_MM = pdfLineHeightMm(PDF_BODY_PT);
const PDF_HEADING_LINE_MM = pdfLineHeightMm(PDF_HEADING_PT);
const PDF_TOC_LINE_MM = PDF_BODY_PT * PDF_TOC_LINE_HEIGHT * PT_TO_MM;

/** Dark orange for „Abenteuer-Wissen“ title. */
const AW_TITLE_RGB = { r: 194, g: 65, b: 12 } as const; // orange-700
/** Soft green card background (lighter than emerald-50). */
const AW_CARD_BG = { r: 245, g: 253, b: 249 } as const; // ~#f5fdf9
const AW_CARD_BORDER = { r: 209, g: 250, b: 229 } as const; // emerald-100
const AW_BULB_RGB = { r: 234, g: 179, b: 8 } as const; // yellow-500
const AW_CHECK_RGB = { r: 22, g: 163, b: 74 } as const; // green-600
/** Fact body inside Abenteuer-Wissen card (same as story body). */
const PDF_AW_FACT_PT = PDF_BODY_PT;
const PDF_AW_FACT_LINE_MM = pdfLineHeightMm(PDF_AW_FACT_PT);

const SVG_BULB = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;

const SVG_CHECK_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;

function romanExportCss(wideCharSpacing: boolean): string {
  const letterSpacing = wideCharSpacing ? "0.1em" : "normal";
  return `
  * { box-sizing: border-box; }
  ${nunitoExportFontCss()}
  @page {
    size: 6in 9in;
    margin: 0.6in;
  }
  .leseno-pdf-root {
    margin: 0;
    padding: 1.5rem;
    background: #fff;
    color: #18181b;
    font-family: ${NUNITO_FONT_FAMILY};
    font-size: 14pt;
    line-height: 1.5;
    letter-spacing: ${letterSpacing};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 6in;
    margin: 0 auto;
  }
  .cover-bleed {
    margin: -1.5rem -1.5rem 2rem;
    background: #09090b;
  }
  .cover-bleed img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 6 / 9;
    object-fit: cover;
  }
  .front-matter {
    margin: 0 0 2.5rem;
    padding: 2rem 0;
    border-bottom: 1px solid #e4e4e7;
    text-align: center;
  }
  .front-matter.impressum {
    text-align: left;
  }
  .front-matter h2 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: #09090b;
  }
  .front-matter .subtitle {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: #52525b;
  }
  .front-matter .author {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: #18181b;
  }
  .front-matter .imprint {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #71717a;
  }
  .front-matter p {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.65;
    color: #3f3f46;
  }
  .front-matter p:last-child { margin-bottom: 0; }
  .meta {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #71717a;
  }
  .chapter { margin: 0 0 2.5rem; break-before: page; }
  .chapter-title {
    margin: 0 0 1em;
    font-size: 18pt;
    font-weight: 800;
    line-height: 1.5;
    letter-spacing: ${letterSpacing};
    color: #09090b;
  }
  .scene { margin: 0 0 1.75rem; }
  .scene-body p {
    margin: 0 0 0.9rem;
    font-size: 14pt;
    font-weight: 400;
    line-height: 1.5;
    letter-spacing: ${letterSpacing};
    text-align: left;
    hyphens: auto;
    color: #18181b;
  }
  .scene-body p.scene-break {
    text-align: center;
    text-indent: 0;
    letter-spacing: 0.35em;
    margin: 1.4em 0;
  }
  .scene-body p:last-child { margin-bottom: 0; }
  .infografik {
    margin: 0;
    padding: 0.4in;
    text-align: center;
    break-before: page;
    break-after: page;
  }
  .infografik img {
    display: block;
    width: 100%;
    max-width: none;
    height: auto;
    border-radius: 0;
  }
  .abenteuer-wissen {
    margin: 1.25rem 0 0;
    padding: 1rem 1.1rem 1.05rem;
    border-radius: 0.85rem;
    background: #f5fdf9;
    border: 1px solid #d1fae5;
    break-inside: avoid;
  }
  .abenteuer-wissen .aw-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #c2410c;
  }
  .abenteuer-wissen .aw-title svg {
    flex-shrink: 0;
    display: block;
  }
  .abenteuer-wissen .hint {
    margin: 0 0 1.25em;
    font-size: 0.85rem;
    font-weight: 600;
    color: #a16207;
  }
  .abenteuer-wissen ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .abenteuer-wissen li {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    margin: 0 0 1.25em;
    font-size: 14pt;
    font-weight: 600;
    line-height: 1.45;
    color: #18181b;
  }
  .abenteuer-wissen li:last-child { margin-bottom: 0; }
  .abenteuer-wissen li svg {
    flex-shrink: 0;
    margin-top: 0.12rem;
    display: block;
  }
  .toc {
    margin: 0 0 2.5rem;
    padding: 1.5rem 0 2rem;
    border-bottom: 1px solid #e4e4e7;
    break-before: page;
    break-after: page;
  }
  .toc h2 {
    margin: 0 0 1.25rem;
    font-size: 1.35rem;
    font-weight: 800;
    color: #09090b;
  }
  .toc ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .toc li {
    margin: 0;
    line-height: 2;
  }
  .toc a {
    display: block;
    font-size: 14pt;
    font-weight: 700;
    line-height: 2;
    color: #9a3412;
    text-decoration: none;
  }
  .toc a:hover {
    text-decoration: underline;
  }
  @media print {
    .leseno-pdf-root { padding: 0; }
    .cover-bleed { margin: 0 0 0; break-after: page; }
    .front-matter, .toc, .chapter { break-before: page; }
    .toc { break-after: page; }
  }
`;
}

function frontMatterHtml(vorsatz: RomanVorsatz): string {
  if (!hasUsableVorsatz(vorsatz)) return "";
  const t = vorsatz.titelseite;
  const parts: string[] = [];

  parts.push(`
  <section class="front-matter titelseite">
    <h2>${escapeHtml(t.titel.trim() || "Unbenannter Roman")}</h2>
    ${
      t.untertitel.trim()
        ? `<p class="subtitle">${escapeHtml(t.untertitel.trim())}</p>`
        : ""
    }
    ${
      t.autor.trim()
        ? `<p class="author">${escapeHtml(t.autor.trim())}</p>`
        : ""
    }
    ${
      t.imprint.trim()
        ? `<p class="imprint">${escapeHtml(t.imprint.trim())}</p>`
        : ""
    }
  </section>`);

  const imp = vorsatz.impressum;
  if (
    imp.hinweis.trim() ||
    imp.disclaimer.trim() ||
    imp.rechteinhaber.trim() ||
    (imp.absatz?.length ?? 0) > 0
  ) {
    const bodyParas: string[] = [];
    if (imp.hinweis.trim()) {
      bodyParas.push(imp.hinweis.trim());
    } else if (imp.rechteinhaber.trim()) {
      bodyParas.push(
        `© ${imp.jahr.trim() || String(new Date().getFullYear())} ${imp.rechteinhaber.trim()}. Alle Rechte vorbehalten.`,
      );
    }
    for (const block of imp.absatz ?? []) {
      if (block.trim()) bodyParas.push(block.trim());
    }
    if (imp.disclaimer.trim()) bodyParas.push(imp.disclaimer.trim());
    parts.push(`
  <section class="front-matter impressum">
    <h2>Impressum</h2>
    ${bodyParas
      .map(
        (b) =>
          `<p>${escapeHtml(b).replaceAll("\n", "<br />")}</p>`,
      )
      .join("\n    ")}
  </section>`);
  }

  if (vorsatz.widmung.trim()) {
    parts.push(`
  <section class="front-matter">
    <p>${escapeHtml(vorsatz.widmung.trim()).replaceAll("\n", "<br />")}</p>
  </section>`);
  }

  if (vorsatz.motto.trim()) {
    parts.push(`
  <section class="front-matter">
    <p><em>${escapeHtml(vorsatz.motto.trim()).replaceAll("\n", "<br />")}</em></p>
  </section>`);
  }

  if (vorsatz.vorwort.trim()) {
    const paras = vorsatz.vorwort
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    parts.push(`
  <section class="front-matter vorwort">
    <h2>Vorwort</h2>
    ${paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ")}
  </section>`);
  }

  return parts.join("\n");
}

/** Avoid multi-MB data URLs in the iframe HTML preview (download PDF keeps full cover). */
function coverHtmlBlock(cover: string): string {
  if (!cover) return "";
  if (cover.length > 900_000) {
    return `<div class="cover-bleed" style="display:flex;align-items:center;justify-content:center;min-height:24rem;color:#fafafa;font-weight:700;">Cover (nur in der gespeicherten PDF)</div>`;
  }
  return `<div class="cover-bleed"><img src="${escapeHtml(cover)}" alt="Cover" /></div>`;
}

function abenteuerWissenHtml(fakten: string[]): string {
  if (fakten.length === 0) return "";
  const items = fakten
    .map((line) => factPlainText(line))
    .filter(Boolean)
    .map(
      (text) =>
        `<li>${SVG_CHECK_CIRCLE}<span>${escapeHtml(text)}</span></li>`,
    )
    .join("");
  return `<aside class="abenteuer-wissen">
    <h3 class="aw-title">${SVG_BULB}<span>Abenteuer-Wissen</span></h3>
    <p class="hint">Was du aus diesem Abenteuer mitnimmst:</p>
    <ul>${items}</ul>
  </aside>`;
}

/**
 * Self-contained HTML document for preview / print.
 */
export function buildRomanExportDocument(input: RomanExportInput): string {
  const chapters = resolveExportChapters(input);
  const title = input.title.trim() || "Unbenannter Roman";
  const vorsatz = input.vorsatz ?? emptyVorsatz();
  const cover = (input.coverImageDataUrl ?? "").trim();
  const wideCharSpacing = romanExportUsesWideCharSpacing(input.typography);

  const chaptersHtml = chapters
    .map((chapter) => {
      const body = paragraphsToHtml(chapter.body);
      const infoUrls = (
        chapter.infografikDataUrls?.length
          ? chapter.infografikDataUrls
          : [(chapter.infografikDataUrl ?? "").trim()]
      )
        .map((u) => u.trim())
        .filter((u) => u.startsWith("data:image/"));
      const fakten = abenteuerWissenExportLines(
        chapter.abenteuerWissenFakten ?? [],
      );
      const infoHtml = infoUrls
        .map((info) =>
          info.length <= 900_000
            ? `<div class="infografik"><img src="${escapeHtml(info)}" alt="Infografik" /></div>`
            : `<div class="infografik"><p class="meta">Infografik (nur in der gespeicherten PDF)</p></div>`,
        )
        .join("\n      ");
      const anchor = `chapter-${chapter.number}`;
      return `
  <section class="chapter" id="${escapeHtml(anchor)}">
    <h2 class="chapter-title">${escapeHtml(chapterHeadingLabel(chapter))}</h2>
    <article class="scene">
      <div class="scene-body">${body}</div>
      ${infoHtml}
      ${abenteuerWissenHtml(fakten)}
    </article>
  </section>`;
    })
    .join("\n");

  const tocHtml =
    chapters.length > 0
      ? `<nav class="toc" aria-label="Inhaltsverzeichnis">
    <h2>Inhaltsverzeichnis</h2>
    <ol>
${chapters
  .map(
    (chapter) =>
      `      <li><a href="#chapter-${chapter.number}">${escapeHtml(chapterHeadingLabel(chapter))}</a></li>`,
  )
  .join("\n")}
    </ol>
  </nav>`
      : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${nunitoGoogleFontsLinkTag()}
  <style>
    body { margin: 0; background: #fff; }
    ${romanExportCss(wideCharSpacing)}
  </style>
</head>
<body>
  <div class="leseno-pdf-root">
    <div class="page">
      ${coverHtmlBlock(cover)}
      ${frontMatterHtml(vorsatz)}
      ${tocHtml}
      ${chaptersHtml || `<p class="meta">Noch kein Manuskript zum Export.</p>`}
    </div>
  </div>
</body>
</html>`;
}

export function romanPdfFilename(title: string): string {
  return `${slugifyFilename(title)}.pdf`;
}

/**
 * Trade paperback (Taschenbuch) 6×9 in — jsPDF custom format [width, height] in mm.
 */
export const PAPERBACK_6X9_PAGE_MM = {
  width: 152.4,
  height: 228.6,
} as const;

/**
 * Infografik inset from each page edge (~0.55 in) — one blank line more than
 * the old 0.4 in frame so full-page graphics match the roomier text margins.
 */
const INFOGRAFIK_EDGE_INSET_IN = 0.55;
const INFOGRAFIK_EDGE_INSET_MM = INFOGRAFIK_EDGE_INSET_IN * 25.4;

/** @deprecated Prefer `PAPERBACK_6X9_PAGE_MM` (same size). */
export const AMAZON_EBOOK_PAGE_MM = PAPERBACK_6X9_PAGE_MM;

type WriteCtx = {
  pdf: jsPDF;
  y: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  pageHeight: number;
  pageWidth: number;
};

function ensureSpace(ctx: WriteCtx, neededMm: number): void {
  if (ctx.y + neededMm <= ctx.pageHeight - ctx.marginBottom) return;
  ctx.pdf.addPage([ctx.pageWidth, ctx.pageHeight], "portrait");
  ctx.y = ctx.marginTop;
}

function writeLines(
  ctx: WriteCtx,
  lines: string[],
  lineHeightMm: number,
): void {
  for (const line of lines) {
    ensureSpace(ctx, lineHeightMm);
    ctx.pdf.text(line, ctx.marginX, ctx.y);
    ctx.y += lineHeightMm;
  }
}

function writeCenteredLines(
  ctx: WriteCtx,
  lines: string[],
  lineHeightMm: number,
): void {
  for (const line of lines) {
    ensureSpace(ctx, lineHeightMm);
    const w = ctx.pdf.getTextWidth(line);
    const x = Math.max(ctx.marginX, (ctx.pageWidth - w) / 2);
    ctx.pdf.text(line, x, ctx.y);
    ctx.y += lineHeightMm;
  }
}

function startNewPage(ctx: WriteCtx): void {
  ctx.pdf.addPage([ctx.pageWidth, ctx.pageHeight], "portrait");
  ctx.y = ctx.marginTop;
}

/** Page number bottom-right (story pages only). */
function drawStoryPageNumber(
  pdf: jsPDF,
  pageWidth: number,
  pageHeight: number,
  marginX: number,
  storyPage: number,
): void {
  clearPdfCharSpacing(pdf);
  setNunito(pdf, "semibold", 10);
  pdf.setTextColor(113, 113, 122);
  const label = String(storyPage);
  const tw = pdf.getTextWidth(label);
  pdf.text(label, pageWidth - marginX - tw, pageHeight - 8);
}

function writeFrontMatterPdf(
  ctx: WriteCtx,
  vorsatz: RomanVorsatz,
  options: { startOnFreshPage: boolean; scale?: PdfTypeScale },
): void {
  if (!hasUsableVorsatz(vorsatz)) return;
  const scale = options.scale ?? resolvePdfTypeScale("default");

  const t = vorsatz.titelseite;
  if (options.startOnFreshPage) {
    startNewPage(ctx);
  }
  ctx.y = ctx.pageHeight * 0.32;
  setNunito(ctx.pdf, "extrabold", scale.fmTitlePt);
  ctx.pdf.setTextColor(9, 9, 11);
  writeCenteredLines(
    ctx,
    ctx.pdf.splitTextToSize(
      t.titel.trim() || "Unbenannter Roman",
      ctx.contentWidth,
    ) as string[],
    scale.fmTitlePt === 19 ? 8 : 7,
  );
  if (t.untertitel.trim()) {
    ctx.y += 3;
    setNunito(ctx.pdf, "semibold", scale.fmSubtitlePt);
    ctx.pdf.setTextColor(82, 82, 91);
    writeCenteredLines(
      ctx,
      ctx.pdf.splitTextToSize(t.untertitel.trim(), ctx.contentWidth) as string[],
      6,
    );
  }
  if (t.autor.trim()) {
    ctx.y += 8;
    setNunito(ctx.pdf, "bold", scale.fmAutorPt);
    ctx.pdf.setTextColor(24, 24, 27);
    writeCenteredLines(ctx, [t.autor.trim()], 6);
  }
  if (t.imprint.trim()) {
    ctx.y += 5;
    setNunito(ctx.pdf, "semibold", 10);
    ctx.pdf.setTextColor(113, 113, 122);
    writeCenteredLines(ctx, [t.imprint.trim()], 5);
  }

  const imp = vorsatz.impressum;
  if (
    imp.hinweis.trim() ||
    imp.disclaimer.trim() ||
    imp.rechteinhaber.trim() ||
    (imp.absatz?.length ?? 0) > 0
  ) {
    startNewPage(ctx);
    // Tolino Print: ≥5 cm top / ≥3 cm bottom on the first Impressum page
    // (Druckvermerk). Overflow continues on the next page with normal margins
    // so Pflichttexte nicht gekürzt werden müssen.
    const savedTop = ctx.marginTop;
    const savedBottom = ctx.marginBottom;
    ctx.marginBottom = Math.max(savedBottom, SACHBUCH_IMPRESSUM_PRINT_BOTTOM_MM);
    ctx.y = SACHBUCH_IMPRESSUM_PRINT_TOP_MM;
    let impressumFirstPage = true;

    const ensureImpressumSpace = (neededMm: number) => {
      if (ctx.y + neededMm <= ctx.pageHeight - ctx.marginBottom) return;
      ctx.pdf.addPage([ctx.pageWidth, ctx.pageHeight], "portrait");
      if (impressumFirstPage) {
        impressumFirstPage = false;
        ctx.marginTop = savedTop;
        ctx.marginBottom = savedBottom;
      }
      ctx.y = ctx.marginTop;
    };

    const writeImpressumLines = (lines: string[], lineHeightMm: number) => {
      for (const line of lines) {
        ensureImpressumSpace(lineHeightMm);
        ctx.pdf.text(line, ctx.marginX, ctx.y);
        ctx.y += lineHeightMm;
      }
    };

    // Slightly denser than body so Pflicht + KI + Disclaimer eher auf S. 1 passen.
    const lineMm = 4.6;
    const gapMm = 2.4;

    setNunito(ctx.pdf, "extrabold", 13);
    ctx.pdf.setTextColor(9, 9, 11);
    writeImpressumLines(["Impressum"], 6.2);
    ctx.y += 2.8;

    setNunito(ctx.pdf, "normal", 9.5);
    ctx.pdf.setTextColor(63, 63, 70);
    const blocks: string[] = [];
    if (imp.hinweis.trim()) {
      blocks.push(imp.hinweis.trim());
    } else if (imp.rechteinhaber.trim()) {
      blocks.push(
        `© ${imp.jahr.trim() || String(new Date().getFullYear())} ${imp.rechteinhaber.trim()}. Alle Rechte vorbehalten.`,
      );
    }
    for (const block of imp.absatz ?? []) {
      if (block.trim()) blocks.push(block.trim());
    }
    if (imp.disclaimer.trim()) blocks.push(imp.disclaimer.trim());
    for (const block of blocks) {
      // Preserve address-line breaks inside a block.
      const paras = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const para of paras) {
        writeImpressumLines(
          ctx.pdf.splitTextToSize(para, ctx.contentWidth) as string[],
          lineMm,
        );
      }
      ctx.y += gapMm;
    }
    ctx.marginTop = savedTop;
    ctx.marginBottom = savedBottom;
  }

  if (vorsatz.widmung.trim()) {
    startNewPage(ctx);
    ctx.y = ctx.pageHeight * 0.4;
    setNunito(ctx.pdf, "semibold", 12);
    ctx.pdf.setTextColor(39, 39, 42);
    writeCenteredLines(
      ctx,
      ctx.pdf.splitTextToSize(
        vorsatz.widmung.trim(),
        ctx.contentWidth * 0.85,
      ) as string[],
      6,
    );
  }

  if (vorsatz.motto.trim()) {
    startNewPage(ctx);
    ctx.y = ctx.pageHeight * 0.4;
    setNunito(ctx.pdf, "semibold", 11);
    ctx.pdf.setTextColor(63, 63, 70);
    writeCenteredLines(
      ctx,
      ctx.pdf.splitTextToSize(
        vorsatz.motto.trim(),
        ctx.contentWidth * 0.85,
      ) as string[],
      6,
    );
  }

  if (vorsatz.vorwort.trim()) {
    startNewPage(ctx);
    setNunito(ctx.pdf, "extrabold", Math.max(scale.bodyPt + 4, 14));
    ctx.pdf.setTextColor(9, 9, 11);
    writeLines(ctx, ["Vorwort"], scale.bodyLineMm * 1.35);
    ctx.y += scale.bodyLineMm * 0.6;
    setNunito(ctx.pdf, "normal", scale.bodyPt);
    ctx.pdf.setTextColor(24, 24, 27);
    const paras = vorsatz.vorwort
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (let i = 0; i < paras.length; i++) {
      const lines = ctx.pdf.splitTextToSize(
        paras[i]!,
        ctx.contentWidth,
      ) as string[];
      writeLines(ctx, lines, scale.bodyLineMm);
      if (i < paras.length - 1) ctx.y += scale.bodyLineMm * 0.45;
    }
  }
}

/** Image cover-fit into a box (may extend past box edges). */
function drawCoverFitInBox(
  pdf: jsPDF,
  dataUrl: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): void {
  const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
  const props = pdf.getImageProperties(dataUrl);
  const imgRatio = props.width / Math.max(1, props.height);
  const boxRatio = boxW / boxH;
  let drawW: number;
  let drawH: number;
  if (imgRatio > boxRatio) {
    drawH = boxH;
    drawW = drawH * imgRatio;
  } else {
    drawW = boxW;
    drawH = drawW / imgRatio;
  }
  const x = boxX + (boxW - drawW) / 2;
  const y = boxY + (boxH - drawH) / 2;
  pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
}

/** Image contain-fit into a box (letterbox; never overflows). */
function drawContainFitInBox(
  pdf: jsPDF,
  dataUrl: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): void {
  const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
  const props = pdf.getImageProperties(dataUrl);
  const imgRatio = props.width / Math.max(1, props.height);
  const boxRatio = boxW / boxH;
  let drawW: number;
  let drawH: number;
  if (imgRatio > boxRatio) {
    drawW = boxW;
    drawH = drawW / imgRatio;
  } else {
    drawH = boxH;
    drawW = drawH * imgRatio;
  }
  const x = boxX + (boxW - drawW) / 2;
  const y = boxY + (boxH - drawH) / 2;
  pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
}

/** Full-bleed cover on the current PDF page (object-fit: cover). */
function drawFullBleedCover(
  pdf: jsPDF,
  dataUrl: string,
  pageWidth: number,
  pageHeight: number,
): void {
  drawCoverFitInBox(pdf, dataUrl, 0, 0, pageWidth, pageHeight);
}

/**
 * Chapter Infografik on a trim 6×9 page with white margin on all four edges.
 * Image fills the inner frame (inset tracks the roomier text margins).
 */
function drawChapterInfografik(ctx: WriteCtx, dataUrl: string): number {
  startNewPage(ctx);
  const pageIndex = ctx.pdf.getNumberOfPages();
  const insetX = INFOGRAFIK_EDGE_INSET_MM;
  const insetTop = Math.max(INFOGRAFIK_EDGE_INSET_MM, ctx.marginTop);
  const insetBottom = Math.max(INFOGRAFIK_EDGE_INSET_MM, ctx.marginBottom);
  const { pdf, pageWidth, pageHeight } = ctx;
  const boxX = insetX;
  const boxY = insetTop;
  const boxW = pageWidth - 2 * insetX;
  const boxH = pageHeight - insetTop - insetBottom;
  // White page so all four margins stay clean.
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  try {
    const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
    pdf.addImage(dataUrl, fmt, boxX, boxY, boxW, boxH);
  } catch {
    // Infografik optional — skip broken data URLs.
  }
  ctx.y = pageHeight;
  return pageIndex;
}

/**
 * Inline figure in the text column (tables) — or near-full page (Abbildungen).
 * Title/Bezeichnung lives on the graphic or in the Kasten — no extra caption.
 * Returns PDF page index when a dedicated figure page was used, else null.
 */
function drawSachbuchFigure(
  ctx: WriteCtx,
  figure: SachbuchFigure,
  usedKeys: Set<string>,
  options: { scale?: PdfTypeScale } = {},
): number | null {
  if (usedKeys.has(figure.key)) return null;
  usedKeys.add(figure.key);
  const pdf = ctx.pdf;
  /** ≥ one blank body line before following prose. */
  const gapBelowMm = options.scale?.bodyLineMm ?? 4.2;

  if (sachbuchFigurePrefersFullPage(figure)) {
    startNewPage(ctx);
    const pageIndex = pdf.getNumberOfPages();
    const insetX = INFOGRAFIK_EDGE_INSET_MM;
    const insetTop = Math.max(INFOGRAFIK_EDGE_INSET_MM, ctx.marginTop);
    const bottomLimit = Math.max(INFOGRAFIK_EDGE_INSET_MM, ctx.marginBottom);
    const boxX = insetX;
    const boxY = insetTop;
    const boxW = ctx.pageWidth - 2 * insetX;
    const boxH = Math.max(40, ctx.pageHeight - boxY - bottomLimit);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, ctx.pageWidth, ctx.pageHeight, "F");
    try {
      drawContainFitInBox(pdf, figure.dataUrl, boxX, boxY, boxW, boxH);
    } catch {
      try {
        const fmt = figure.dataUrl.includes("image/png") ? "PNG" : "JPEG";
        pdf.addImage(figure.dataUrl, fmt, boxX, boxY, boxW, boxH);
      } catch {
        // optional
      }
    }
    ctx.y = ctx.pageHeight;
    return pageIndex;
  }

  const boxW = ctx.contentWidth;
  let boxH = Math.min(boxW * (2 / 3), 78);
  const avail =
    ctx.pageHeight - ctx.marginBottom - Math.max(ctx.y, ctx.marginTop);
  if (boxH + gapBelowMm + 4 > avail) {
    startNewPage(ctx);
  }
  const availAfter = ctx.pageHeight - ctx.marginBottom - ctx.y;
  boxH = Math.min(boxH, Math.max(28, availAfter - gapBelowMm - 2));
  try {
    const fmt = figure.dataUrl.includes("image/png") ? "PNG" : "JPEG";
    pdf.addImage(figure.dataUrl, fmt, ctx.marginX, ctx.y, boxW, boxH);
    ctx.y += boxH + gapBelowMm;
  } catch {
    // optional
  }
  return null;
}

function writeProseWithInlineFigures(
  ctx: WriteCtx,
  text: string,
  scale: PdfTypeScale,
  wrapW: number,
  figures: SachbuchFigure[],
  usedKeys: Set<string>,
  betweenParasGap: number,
  infografikPdfPages: Set<number>,
): void {
  const pdf = ctx.pdf;
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]!;
    if (isSceneBreakParagraph(para)) {
      ctx.y += scale.bodyLineMm * 0.5;
      writeCenteredLines(ctx, [SCENE_BREAK_MARKER], scale.bodyLineMm);
      ctx.y += scale.bodyLineMm * 0.5;
      continue;
    }
    const parts = splitProseAroundFigureCaption(para);
    const segments = [parts.before, parts.caption, parts.after].filter(
      (s): s is string => Boolean(s && s.trim()),
    );
    // If no caption split, still try whole-para key (box titles).
    if (!parts.figureKey && segments.length <= 1) {
      const lines = pdf.splitTextToSize(para, wrapW) as string[];
      writeLines(ctx, lines, scale.bodyLineMm);
      if (i < paras.length - 1) ctx.y += betweenParasGap;
      continue;
    }
    if (parts.before) {
      const lines = pdf.splitTextToSize(parts.before, wrapW) as string[];
      writeLines(ctx, lines, scale.bodyLineMm);
      ctx.y += betweenParasGap * 0.6;
    }
    if (parts.figureKey) {
      const fig = sachbuchFigureByKey(figures, parts.figureKey);
      if (fig && !usedKeys.has(fig.key)) {
        // Caption text is on the graphic — skip re-emitting it in prose.
        const page = drawSachbuchFigure(ctx, fig, usedKeys, { scale });
        if (page != null) infografikPdfPages.add(page);
        setNunito(pdf, "normal", scale.bodyPt);
        pdf.setTextColor(24, 24, 27);
      } else if (fig && usedKeys.has(fig.key)) {
        // Already placed (e.g. after a Kasten) — omit caption.
      } else if (parts.caption) {
        const lines = pdf.splitTextToSize(parts.caption, wrapW) as string[];
        writeLines(ctx, lines, scale.bodyLineMm);
      }
    } else if (parts.caption) {
      const lines = pdf.splitTextToSize(parts.caption, wrapW) as string[];
      writeLines(ctx, lines, scale.bodyLineMm);
    }
    if (parts.after) {
      ctx.y += betweenParasGap * 0.5;
      const lines = pdf.splitTextToSize(parts.after, wrapW) as string[];
      writeLines(ctx, lines, scale.bodyLineMm);
    }
    if (i < paras.length - 1) ctx.y += betweenParasGap;
  }
}

/** Yellow lightbulb (heading icon) — simple filled shapes. */
function drawBulbIcon(
  pdf: jsPDF,
  x: number,
  y: number,
  sizeMm: number,
): void {
  const cx = x + sizeMm / 2;
  const cy = y + sizeMm * 0.38;
  pdf.setFillColor(AW_BULB_RGB.r, AW_BULB_RGB.g, AW_BULB_RGB.b);
  pdf.circle(cx, cy, sizeMm * 0.3, "F");
  pdf.roundedRect(
    x + sizeMm * 0.3,
    y + sizeMm * 0.58,
    sizeMm * 0.4,
    sizeMm * 0.2,
    0.4,
    0.4,
    "F",
  );
  pdf.setFillColor(202, 138, 4);
  pdf.rect(x + sizeMm * 0.36, y + sizeMm * 0.8, sizeMm * 0.28, sizeMm * 0.12, "F");
}

/** Green check-circle (fact bullet). */
function drawCheckCircleIcon(
  pdf: jsPDF,
  x: number,
  y: number,
  sizeMm: number,
): void {
  const cx = x + sizeMm / 2;
  const cy = y + sizeMm / 2;
  const r = sizeMm * 0.42;
  pdf.setDrawColor(AW_CHECK_RGB.r, AW_CHECK_RGB.g, AW_CHECK_RGB.b);
  pdf.setLineWidth(0.45);
  pdf.circle(cx, cy, r, "S");
  // Check mark (two segments).
  pdf.setLineWidth(0.5);
  const x1 = cx - r * 0.35;
  const y1 = cy + r * 0.05;
  const x2 = cx - r * 0.05;
  const y2 = cy + r * 0.35;
  const x3 = cx + r * 0.4;
  const y3 = cy - r * 0.3;
  pdf.line(x1, y1, x2, y2);
  pdf.line(x2, y2, x3, y3);
}

/**
 * Soft-green card with yellow bulb title + green check-circle facts.
 * Placed after Infografik (or after prose when no image).
 */
function writeAbenteuerWissenCard(ctx: WriteCtx, fakten: string[]): void {
  const plain = fakten.map(factPlainText).filter(Boolean);
  if (plain.length === 0) return;

  const pdf = ctx.pdf;
  const padX = 4;
  const padY = 4;
  const bulbSize = 5;
  const checkSize = 4.2;
  const titleH = 6;
  const lineH = PDF_AW_FACT_LINE_MM;
  /** One blank line after Untertitel and between facts. */
  const blankLine = PDF_AW_FACT_LINE_MM;
  const textIndent = checkSize + 2.5;
  const innerW = ctx.contentWidth - padX * 2;
  const textW = innerW - textIndent;

  clearPdfCharSpacing(pdf);
  setNunito(pdf, "normal", PDF_AW_FACT_PT);
  const wrappedFacts = plain.map(
    (f) => pdf.splitTextToSize(f, textW) as string[],
  );
  const hint = "Was du aus diesem Abenteuer mitnimmst:";
  setNunito(pdf, "semibold", 10);
  const hintLines = pdf.splitTextToSize(hint, innerW) as string[];

  let cardH = padY + titleH + 1.2;
  cardH += hintLines.length * 4.5 + blankLine;
  for (let i = 0; i < wrappedFacts.length; i++) {
    const lines = wrappedFacts[i]!;
    cardH += Math.max(checkSize, lines.length * lineH);
    if (i < wrappedFacts.length - 1) cardH += blankLine;
  }
  cardH += padY;

  const avail = ctx.pageHeight - ctx.marginBottom - ctx.y;
  if (cardH > avail && ctx.y > ctx.marginTop + 2) {
    startNewPage(ctx);
  }

  const cardX = ctx.marginX;
  const cardY = ctx.y;
  const drawH = Math.min(
    cardH,
    ctx.pageHeight - ctx.marginBottom - cardY,
  );

  pdf.setFillColor(AW_CARD_BG.r, AW_CARD_BG.g, AW_CARD_BG.b);
  pdf.setDrawColor(AW_CARD_BORDER.r, AW_CARD_BORDER.g, AW_CARD_BORDER.b);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(cardX, cardY, ctx.contentWidth, drawH, 3.2, 3.2, "FD");

  let cy = cardY + padY + 1.2;

  drawBulbIcon(pdf, cardX + padX, cy - 0.5, bulbSize);
  setNunito(pdf, "extrabold", PDF_BODY_PT);
  pdf.setTextColor(AW_TITLE_RGB.r, AW_TITLE_RGB.g, AW_TITLE_RGB.b);
  pdf.text("Abenteuer-Wissen", cardX + padX + bulbSize + 2, cy + 3.6);
  // Tight gap to Untertitel — no blank line here.
  cy += titleH + 1.2;

  setNunito(pdf, "semibold", 10);
  pdf.setTextColor(161, 98, 7);
  for (const line of hintLines) {
    pdf.text(line, cardX + padX, cy + 3);
    cy += 4.5;
  }
  // Blank line after Untertitel, before first fact.
  cy += blankLine;

  setNunito(pdf, "normal", PDF_AW_FACT_PT);
  pdf.setTextColor(24, 24, 27);

  for (let i = 0; i < plain.length; i++) {
    const lines = wrappedFacts[i]!;
    const blockH = Math.max(checkSize, lines.length * lineH);
    if (cy + blockH > ctx.pageHeight - ctx.marginBottom) {
      // Continue on next page without a new card chrome (rare overflow).
      startNewPage(ctx);
      cy = ctx.y;
      pdf.setFillColor(AW_CARD_BG.r, AW_CARD_BG.g, AW_CARD_BG.b);
      const restH = ctx.pageHeight - ctx.marginBottom - cy;
      pdf.setDrawColor(AW_CARD_BORDER.r, AW_CARD_BORDER.g, AW_CARD_BORDER.b);
      pdf.roundedRect(cardX, cy, ctx.contentWidth, restH, 3.2, 3.2, "FD");
      cy += padY;
      setNunito(pdf, "normal", PDF_AW_FACT_PT);
      pdf.setTextColor(24, 24, 27);
    }

    drawCheckCircleIcon(pdf, cardX + padX, cy, checkSize);
    let ty = cy + 3.2;
    for (const line of lines) {
      pdf.text(line, cardX + padX + textIndent, ty);
      ty += lineH;
    }
    cy += blockH;
    if (i < plain.length - 1) cy += blankLine;
  }

  ctx.y = Math.max(ctx.y, cardY + drawH + 2);
}

type SachbuchBoxLine = {
  text: string;
  kind: "title" | "body" | "bullet" | "gap";
  lineH: number;
};

function heightOfBoxLines(lines: SachbuchBoxLine[]): number {
  return lines.reduce((sum, l) => sum + l.lineH, 0);
}

/** Split box body into scannable chunks (blank lines + bullet/number rows). */
function expandSachbuchBoxParas(body: string): string[] {
  const chunks = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    const listish =
      lines.length > 1 &&
      lines.every((l) => /^(?:[•\-–—]|\d+[.)])\s+/.test(l));
    if (listish) {
      for (const l of lines) out.push(l);
    } else if (
      lines.length === 1 &&
      /^(?:[•\-–—]|\d+[.)])\s+/.test(lines[0]!)
    ) {
      out.push(lines[0]!);
    } else {
      out.push(chunk.replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

/**
 * Soft gray card for Sachbuch One-Pager / Merksatz / Infobox / Schaubild.
 * Paginates: each page draws a border only as tall as that page's content
 * (never a single rect taller than the printable area).
 */
function writeSachbuchLayoutBox(
  ctx: WriteCtx,
  block: Extract<SachbuchLayoutBlock, { type: "box" }>,
  scale: PdfTypeScale,
  wrapW: number,
): void {
  const pdf = ctx.pdf;
  const padX = 3.5;
  const padY = 3.2;
  const titlePt = Math.max(scale.bodyPt, 10);
  const bodyPt = scale.bodyPt;
  const titleLineH = titlePt * 1.35 * (25.4 / 72);
  const bodyLineH = scale.bodyLineMm;
  const gapH = bodyLineH * 0.35;
  const innerW = wrapW - padX * 2;
  const head = sachbuchBoxChromeTitle(block.kind, block.title);

  clearPdfCharSpacing(pdf);
  setNunito(pdf, "bold", titlePt);
  const titleLines = head
    ? (pdf.splitTextToSize(head, innerW) as string[])
    : [];
  setNunito(pdf, "normal", bodyPt);
  // Body already deduped in parseSachbuchLayoutBlocks.
  // Blank-line paragraphs; within a chunk, bullet/number lines stay separate.
  const paras = expandSachbuchBoxParas(block.body);

  const queue: SachbuchBoxLine[] = [];
  for (const line of titleLines) {
    queue.push({ text: line, kind: "title", lineH: titleLineH });
  }
  // Title → body: ~½ body line so chrome doesn’t sit on the first sentence.
  const titleBodyGap = Math.max(bodyLineH * 0.55, 3.2);
  if (titleLines.length > 0 && paras.length > 0) {
    queue.push({ text: "", kind: "gap", lineH: titleBodyGap });
  }
  const bulletIndent = 3.2;
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]!;
    const isBullet = /^(?:[•\-–—]|\d+[.)])\s+/.test(para);
    const wrapWInner = isBullet ? innerW - bulletIndent : innerW;
    const wrapped = pdf.splitTextToSize(para, wrapWInner) as string[];
    for (const line of wrapped) {
      queue.push({
        text: line,
        kind: isBullet ? "bullet" : "body",
        lineH: bodyLineH,
      });
    }
    if (i < paras.length - 1) {
      queue.push({
        text: "",
        kind: "gap",
        lineH: isBullet ? gapH * 0.7 : gapH,
      });
    }
  }

  /**
   * Solid box chrome reads tighter than prose against the footer.
   * Page numbers sit at pageHeight−8; keep extra air so the card
   * never crowds into them when a segment fills the page.
   */
  const BOX_FOOTER_CLEARANCE_MM = 8;
  const pageBottom = () =>
    ctx.pageHeight - ctx.marginBottom - BOX_FOOTER_CLEARANCE_MM;
  const minSegment = padY * 2 + bodyLineH + titleLineH;

  const continuationHeader = (): SachbuchBoxLine[] => {
    if (!head) return [];
    const lines = pdf.splitTextToSize(`${head} (Forts.)`, innerW) as string[];
    const out: SachbuchBoxLine[] = lines.map((text) => ({
      text,
      kind: "title" as const,
      lineH: titleLineH,
    }));
    out.push({ text: "", kind: "gap", lineH: Math.max(bodyLineH * 0.45, 2.6) });
    return out;
  };

  let idx = 0;
  let isContinuation = false;
  while (idx < queue.length) {
    if (pageBottom() - ctx.y < minSegment && ctx.y > ctx.marginTop + 1) {
      startNewPage(ctx);
    }

    const header = isContinuation ? continuationHeader() : [];
    const headerH = heightOfBoxLines(header);
    let availForBody = pageBottom() - ctx.y - padY * 2 - headerH;
    if (availForBody < bodyLineH && ctx.y > ctx.marginTop + 1) {
      startNewPage(ctx);
      availForBody = pageBottom() - ctx.y - padY * 2 - headerH;
    }

    const slice: SachbuchBoxLine[] = [...header];
    let bodyUsed = 0;
    while (idx < queue.length) {
      const next = queue[idx]!;
      if (bodyUsed + next.lineH > availForBody && slice.length > header.length) {
        break;
      }
      if (bodyUsed + next.lineH > availForBody && slice.length === header.length) {
        // Force at least one body line to avoid stalling.
        slice.push(next);
        idx += 1;
        break;
      }
      slice.push(next);
      bodyUsed += next.lineH;
      idx += 1;
    }

    const cardX = ctx.marginX;
    const cardY = ctx.y;
    const contentH = heightOfBoxLines(slice);
    /**
     * Trim soft leading after the last ink line so padY above the first glyph
     * top equals padY below the last glyph bottom (jsPDF default baseline
     * made the top look tighter).
     */
    let softTail = 0;
    let lastInkIdx = -1;
    for (let i = slice.length - 1; i >= 0; i--) {
      if (slice[i]!.kind === "gap") {
        softTail += slice[i]!.lineH;
        continue;
      }
      lastInkIdx = i;
      const pt = slice[i]!.kind === "title" ? titlePt : bodyPt;
      const inkMm = pt * (25.4 / 72) * 1.2;
      softTail += Math.max(0, slice[i]!.lineH - inkMm);
      break;
    }
    const drawnH = Math.max(bodyLineH, contentH - softTail);
    const rawH = padY * 2 + drawnH;
    // Never paint past the printable bottom (safety clamp).
    const segmentH = Math.min(rawH, Math.max(minSegment, pageBottom() - cardY));

    pdf.setFillColor(244, 244, 245);
    pdf.setDrawColor(212, 212, 216);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(cardX, cardY, ctx.contentWidth, segmentH, 2.2, 2.2, "FD");

    let cy = cardY + padY;
    pdf.setTextColor(24, 24, 27);
    for (let i = 0; i < slice.length; i++) {
      const item = slice[i]!;
      if (item.kind === "gap") {
        if (lastInkIdx >= 0 && i > lastInkIdx) break;
        cy += item.lineH;
        continue;
      }
      setNunito(
        pdf,
        item.kind === "title" ? "bold" : "normal",
        item.kind === "title" ? titlePt : bodyPt,
      );
      const x =
        cardX + padX + (item.kind === "bullet" ? bulletIndent : 0);
      pdf.text(item.text, x, cy, { baseline: "top" });
      if (i === lastInkIdx) {
        const pt = item.kind === "title" ? titlePt : bodyPt;
        cy += pt * (25.4 / 72) * 1.2;
        break;
      }
      cy += item.lineH;
    }

    ctx.y = cardY + segmentH;
    if (idx < queue.length) {
      startNewPage(ctx);
      isContinuation = true;
    }
  }
}

/** Sachbuch Herstellung body: Zwischenüberschriften + Kästen + Prosa + Figuren. */
function writeSachbuchLayoutBody(
  ctx: WriteCtx,
  body: string,
  scale: PdfTypeScale,
  wrapW: number,
  charScale: number,
  figures: SachbuchFigure[],
  usedKeys: Set<string>,
  infografikPdfPages: Set<number>,
): void {
  const pdf = ctx.pdf;
  const blocks = parseSachbuchLayoutBlocks(body);
  const subPt = scale.headingPt;
  const deckPt = Math.min(scale.bodyPt + 1.5, subPt - 1);
  /**
   * Visual gap (ink ↔ box edge), not raw ctx.y deltas.
   * writeLines uses alphabetic baseline: after a prose block, ctx.y already
   * sits ~1 line below the last baseline (soft leading below the ink).
   * After a box, the next prose baseline sits at ctx.y while glyphs rise by
   * ~ascent — that eats into a naive equal gap. Compensate both sides.
   */
  const fontMm = scale.bodyPt * PT_TO_MM;
  const ascentMm = fontMm * 0.8;
  const descentMm = fontMm * 0.25;
  /** Visual gap above a Kasten (to preceding prose). */
  const boxGapAbove = scale.bodyLineMm * 0.7;
  /** Visual gap below a Kasten (to following prose / next Kasten) — a bit roomier. */
  const boxGapBelow = scale.bodyLineMm * 1.05;
  /** Soft leading already below last prose ink when ctx.y is past writeLines. */
  const softBelowProse = scale.bodyLineMm - descentMm;
  /** Extra air above Unterkapitel so it reads as a new section. */
  const beforeHeadingGap = scale.bodyLineMm * 1.75;
  /** Tight stack: Bezeichnung → Untertitel, then rule under the pair. */
  const headingToSubtitleGap = scale.bodyLineMm * 0.12;
  const afterHeadingBlockGap = scale.bodyLineMm * 0.65;
  const betweenParasGap = scale.bodyLineMm * 0.4;
  /** After a box edge: next alphabetic baseline needs +ascent for equal visual gap. */
  let pendingAscentBeforeText = false;

  const drawUnterkapitelRule = () => {
    ensureSpace(ctx, 3.2);
    const ruleY = ctx.y + 0.8;
    pdf.setDrawColor(212, 212, 216);
    pdf.setLineWidth(0.35);
    pdf.line(ctx.marginX, ruleY, ctx.marginX + ctx.contentWidth, ruleY);
    ctx.y = ruleY + 2.2;
  };

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!;
    if (block.type === "heading") {
      if (pendingAscentBeforeText) {
        ctx.y += ascentMm;
        pendingAscentBeforeText = false;
      }
      ctx.y += beforeHeadingGap;
      setNunito(pdf, "extrabold", subPt);
      applyPdfCharSpacing(pdf, charScale);
      pdf.setTextColor(9, 9, 11);
      const lines = pdf.splitTextToSize(block.text, wrapW) as string[];
      writeLines(ctx, lines, scale.headingLineMm * 0.92);

      const next = blocks[bi + 1];
      if (next?.type === "prose") {
        const { subtitle, rest } = splitSachbuchProseLeadingSubtitle(next.text);
        if (subtitle) {
          // Pull deck tight under the Bezeichnung (less than a full line).
          ctx.y += headingToSubtitleGap;
          setNunito(pdf, "semibold", deckPt);
          pdf.setTextColor(63, 63, 70);
          const deckLines = pdf.splitTextToSize(subtitle, wrapW) as string[];
          writeLines(ctx, deckLines, pdfLineHeightMm(deckPt) * 0.9);
          blocks[bi + 1] = { type: "prose", text: rest };
        }
      }
      // Rule under the whole heading block (Bezeichnung + optional Untertitel).
      drawUnterkapitelRule();
      ctx.y += afterHeadingBlockGap;
      setNunito(pdf, "normal", scale.bodyPt);
      pdf.setTextColor(24, 24, 27);
      continue;
    }

    if (block.type === "box") {
      if (pendingAscentBeforeText) {
        // Box after box: only the outer gap (no prose ascent).
        pendingAscentBeforeText = false;
        ctx.y += boxGapBelow;
      } else {
        // After prose/heading: tuck into leftover line leading.
        ctx.y += boxGapAbove - softBelowProse;
      }
      // Caption text is replaced by the graphic after the Kasten.
      const bodySansCaptions = stripKnownFigureCaptions(block.body, (key) =>
        Boolean(sachbuchFigureByKey(figures, key)),
      );
      writeSachbuchLayoutBox(
        ctx,
        { ...block, body: bodySansCaptions },
        scale,
        wrapW,
      );
      // Figure referenced in box title/body → place right after the Kasten.
      const boxKey =
        splitProseAroundFigureCaption(
          `${block.title}\n${block.body.slice(0, 500)}`,
        ).figureKey ||
        splitProseAroundFigureCaption(block.body).figureKey;
      if (boxKey) {
        const fig = sachbuchFigureByKey(figures, boxKey);
        if (fig && !usedKeys.has(fig.key)) {
          ctx.y += 2;
          const page = drawSachbuchFigure(ctx, fig, usedKeys, { scale });
          if (page != null) infografikPdfPages.add(page);
        }
      }
      ctx.y += boxGapBelow;
      pendingAscentBeforeText = true;
      applyPdfCharSpacing(pdf, charScale);
      setNunito(pdf, "normal", scale.bodyPt);
      pdf.setTextColor(24, 24, 27);
      continue;
    }

    if (pendingAscentBeforeText) {
      ctx.y += ascentMm;
      pendingAscentBeforeText = false;
    }

    writeProseWithInlineFigures(
      ctx,
      block.text,
      scale,
      wrapW,
      figures,
      usedKeys,
      betweenParasGap,
      infografikPdfPages,
    );
  }
}

/**
 * TOC page(s) after front matter; entries filled once chapter start pages
 * are known (`fillTocPdfEntries`). Always ends ready for chapter `startNewPage`.
 */
function beginTocPdf(
  ctx: WriteCtx,
  chapterCount: number,
  options: { startOnFreshPage: boolean; scale?: PdfTypeScale },
): {
  tocStartPage: number;
  contentStartY: number;
} {
  const scale = options.scale ?? resolvePdfTypeScale("default");
  const lineH = scale.tocLineMm;
  const headingBlock = scale.bodyPt >= 14 ? 14 : 12;
  const usable =
    ctx.pageHeight - ctx.marginTop - ctx.marginBottom - headingBlock;
  const linesPerPage = Math.max(1, Math.floor(usable / lineH));
  const tocPageCount = Math.max(1, Math.ceil(chapterCount / linesPerPage));

  if (options.startOnFreshPage) {
    startNewPage(ctx);
  } else {
    ctx.y = ctx.marginTop;
  }
  const tocStartPage = ctx.pdf.getNumberOfPages();
  setNunito(ctx.pdf, "extrabold", scale.bodyPt >= 14 ? 17 : 14);
  ctx.pdf.setTextColor(9, 9, 11);
  ctx.pdf.text("Inhaltsverzeichnis", ctx.marginX, ctx.y + 2);
  ctx.y += headingBlock;
  const contentStartY = ctx.y;

  // Reserve extra TOC pages so chapter page numbers stay stable when filled later.
  for (let i = 1; i < tocPageCount; i++) {
    startNewPage(ctx);
  }
  return { tocStartPage, contentStartY };
}

/** Draw clickable TOC entries (page jump) after chapter start pages are known. */
function fillTocPdfEntries(
  ctx: WriteCtx,
  chapters: RomanExportChapter[],
  chapterStartPage: Map<number, number>,
  tocStartPage: number,
  contentStartY: number,
  storyStartPdfPage: number,
  scale: PdfTypeScale = resolvePdfTypeScale("default"),
): void {
  const pdf = ctx.pdf;
  const lineH = scale.tocLineMm;
  const pageNumW = 10;
  const textW = ctx.contentWidth - pageNumW - 4;

  pdf.setPage(tocStartPage);
  let y = contentStartY;
  let page = tocStartPage;

  for (const chapter of chapters) {
    const targetPage = chapterStartPage.get(chapter.number);
    if (targetPage == null) continue;
    const label = chapterHeadingLabel(chapter);
    const storyPage =
      storyStartPdfPage > 0
        ? targetPage - storyStartPdfPage + 1
        : targetPage;

    if (y + lineH > ctx.pageHeight - ctx.marginBottom) {
      page += 1;
      pdf.setPage(page);
      y = ctx.marginTop;
    }

    setNunito(pdf, "bold", scale.bodyPt);
    pdf.setTextColor(154, 52, 18);
    const lines = pdf.splitTextToSize(label, textW) as string[];
    const first = lines[0] ?? label;
    pdf.textWithLink(first, ctx.marginX, y + 3.5, {
      pageNumber: targetPage,
    });
    // Extra wrapped lines (rare) — still clickable via a full-width link box.
    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        y += lineH;
        if (y + lineH > ctx.pageHeight - ctx.marginBottom) {
          page += 1;
          pdf.setPage(page);
          y = ctx.marginTop;
        }
        pdf.textWithLink(lines[i]!, ctx.marginX, y + 3.5, {
          pageNumber: targetPage,
        });
      }
    }

    setNunito(pdf, "semibold", 11);
    pdf.setTextColor(82, 82, 91);
    const pageLabel = String(storyPage);
    const tw = pdf.getTextWidth(pageLabel);
    pdf.textWithLink(pageLabel, ctx.marginX + ctx.contentWidth - tw, y + 3.5, {
      pageNumber: targetPage,
    });

    y += lineH;
  }
}

/**
 * Builds a real text PDF (Nunito embedded) from Manuskript chapters.
 * 6×9 in Taschenbuch; optional cover; TOC (clickable); each chapter on a new page;
 * Infografik with ~0.55 in inset from the page edge on the following page;
 * then Abenteuer-Wissen card.
 */
export async function buildRomanPdfBlob(
  input: RomanExportInput,
): Promise<Blob> {
  const chapters = resolveExportChapters(input);
  if (!chapters.length) {
    throw new Error("Noch kein Manuskript zum Export.");
  }

  const vorsatz = input.vorsatz ?? emptyVorsatz();
  const cover = (input.coverImageDataUrl ?? "").trim();
  const hasVorsatz = hasUsableVorsatz(vorsatz);
  const scale = resolvePdfTypeScale(input.printDensity);

  const pageWidth = PAPERBACK_6X9_PAGE_MM.width;
  const pageHeight = PAPERBACK_6X9_PAGE_MM.height;

  const pdf = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: "portrait",
  });
  await ensureNunitoOnPdf(pdf);

  const marginX = 14;
  /** One blank body line of air beyond the base trim so text/graphics sit off the edge. */
  const edgeBlankLineMm = scale.bodyLineMm;
  const marginTop = 16 + edgeBlankLineMm;
  /** Leave room for bottom-right page numbers on story pages (+ one blank line). */
  const marginBottom = 18 + edgeBlankLineMm;
  const contentWidth = pageWidth - marginX * 2;
  const charScale = romanExportUsesWideCharSpacing(input.typography)
    ? PDF_CHAR_SCALE_WIDE
    : 1;
  const wrapW = pdfWrapWidthMm(contentWidth, charScale);

  const ctx: WriteCtx = {
    pdf,
    y: marginTop,
    marginX,
    marginTop,
    marginBottom,
    contentWidth,
    pageHeight,
    pageWidth,
  };

  let pageUsed = false;

  if (cover.startsWith("data:image/")) {
    try {
      drawFullBleedCover(pdf, cover, pageWidth, pageHeight);
      pageUsed = true;
    } catch {
      // Cover optional — continue without image page.
    }
  }

  if (hasVorsatz) {
    writeFrontMatterPdf(ctx, vorsatz, {
      startOnFreshPage: pageUsed,
      scale,
    });
    pageUsed = true;
  }

  // TOC on its own page(s); chapter loop always starts a new page afterward.
  const tocMeta = beginTocPdf(ctx, chapters.length, {
    startOnFreshPage: pageUsed,
    scale,
  });
  pageUsed = true;

  /** 1-based jsPDF page index where story numbering starts; 0 = not yet. */
  let storyStartPdfPage = 0;
  const chapterStartPage = new Map<number, number>();
  /** Bleed Infografik pages — no folio (image owns the sheet). */
  const infografikPdfPages = new Set<number>();

  for (const chapter of chapters) {
    const paras = paragraphsPlain(chapter.body);
    const fakten = abenteuerWissenExportLines(
      chapter.abenteuerWissenFakten ?? [],
    );
    const infoUrls = (
      chapter.infografikDataUrls?.length
        ? chapter.infografikDataUrls
        : [(chapter.infografikDataUrl ?? "").trim()]
    )
      .map((u) => u.trim())
      .filter((u) => u.startsWith("data:image/"));
    const hasInfo = infoUrls.length > 0;
    if (!paras.length && !hasInfo && fakten.length === 0) continue;

    // Always new page after TOC / previous chapter.
    startNewPage(ctx);
    if (storyStartPdfPage === 0) {
      storyStartPdfPage = pdf.getNumberOfPages();
    }
    chapterStartPage.set(chapter.number, pdf.getNumberOfPages());

    setNunito(pdf, "extrabold", scale.chapterTitlePt);
    applyPdfCharSpacing(pdf, charScale);
    pdf.setTextColor(9, 9, 11);
    const headingLines = pdf.splitTextToSize(
      chapterHeadingLabel(chapter),
      wrapW,
    ) as string[];
    writeLines(ctx, headingLines, scale.chapterTitleLineMm);
    // One blank line between Kapitelüberschrift and body.
    ctx.y += scale.bodyLineMm;
    pageUsed = true;

    setNunito(pdf, "normal", scale.bodyPt);
    applyPdfCharSpacing(pdf, charScale);
    pdf.setTextColor(24, 24, 27);

    const figures: SachbuchFigure[] = (chapter.sachbuchFigures ?? []).map(
      (f) => ({
        key: f.key,
        title: f.title,
        dataUrl: f.dataUrl,
        prompt: "",
      }),
    );
    const usedFigureKeys = new Set<string>();

    if (hasSachbuchLayoutMarkup(chapter.body)) {
      writeSachbuchLayoutBody(
        ctx,
        chapter.body,
        scale,
        wrapW,
        charScale,
        figures,
        usedFigureKeys,
        infografikPdfPages,
      );
    } else if (figures.length) {
      writeProseWithInlineFigures(
        ctx,
        chapter.body,
        scale,
        wrapW,
        figures,
        usedFigureKeys,
        scale.bodyLineMm * 0.4,
        infografikPdfPages,
      );
    } else {
      for (const para of paras) {
        if (isSceneBreakParagraph(para)) {
          ctx.y += scale.bodyLineMm * 0.5;
          writeCenteredLines(ctx, [SCENE_BREAK_MARKER], scale.bodyLineMm);
          ctx.y += scale.bodyLineMm * 0.5;
          continue;
        }
        const lines = pdf.splitTextToSize(para, wrapW) as string[];
        writeLines(ctx, lines, scale.bodyLineMm);
        ctx.y += scale.bodyLineMm * 0.4;
      }
    }
    clearPdfCharSpacing(pdf);

    // Unused figures (or Clever legacy URLs) → pages after chapter prose.
    for (const fig of figures) {
      if (usedFigureKeys.has(fig.key)) continue;
      const page = drawSachbuchFigure(ctx, fig, usedFigureKeys, { scale });
      if (page != null) infografikPdfPages.add(page);
    }
    if (!figures.length) {
      for (const infoUrl of infoUrls) {
        infografikPdfPages.add(drawChapterInfografik(ctx, infoUrl));
      }
    }

    if (fakten.length > 0) {
      if (hasInfo) startNewPage(ctx);
      else ctx.y += 4;
      writeAbenteuerWissenCard(ctx, fakten);
    }
  }

  fillTocPdfEntries(
    ctx,
    chapters.filter((c) => chapterStartPage.has(c.number)),
    chapterStartPage,
    tocMeta.tocStartPage,
    tocMeta.contentStartY,
    storyStartPdfPage,
    scale,
  );

  if (storyStartPdfPage > 0) {
    const totalPages = pdf.getNumberOfPages();
    for (let pdfPage = storyStartPdfPage; pdfPage <= totalPages; pdfPage++) {
      if (infografikPdfPages.has(pdfPage)) continue;
      pdf.setPage(pdfPage);
      drawStoryPageNumber(
        pdf,
        pageWidth,
        pageHeight,
        marginX,
        pdfPage - storyStartPdfPage + 1,
      );
    }
  }

  const raw = pdf.output("blob");
  const blob = new Blob([raw], { type: "application/pdf" });
  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF") || blob.size < 500) {
    throw new Error("PDF kam leer oder ungültig zurück.");
  }
  return blob;
}
