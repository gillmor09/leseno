/**
 * Admin roman export: HTML preview + text PDF (jsPDF + embedded Nunito).
 * Order: optional cover image → eBook front matter → revised scenes.
 * Text PDFs avoid blank html2canvas captures on long novels.
 */

import { jsPDF } from "jspdf";
import {
  NUNITO_FONT_FAMILY,
  nunitoExportFontCss,
  nunitoGoogleFontsLinkTag,
} from "@/lib/pdf/export-font";
import { ensureNunitoOnPdf, setNunito } from "@/lib/pdf/jspdf-nunito";
import {
  emptyVorsatz,
  hasUsableVorsatz,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import type { Szene } from "@/lib/roman/types";

export type RomanExportScene = Pick<
  Szene,
  "kapitelNr" | "szenenNr" | "entwurfRevidiert" | "status"
>;

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

function paragraphsToHtml(text: string): string {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map((p) => `<p>${escapeHtml(p).replaceAll("\n", "<br />")}</p>`)
    .join("\n");
}

function paragraphsPlain(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export type RomanExportInput = {
  title: string;
  szenen: RomanExportScene[];
  /** Total scene count (unused in body; kept for callers). */
  totalSzenen?: number;
  /** Optional Flux cover data URL (first full-bleed page). */
  coverImageDataUrl?: string;
  /** Minimal eBook front matter after cover, before chapter 1. */
  vorsatz?: RomanVorsatz;
};

const ROMAN_EXPORT_CSS = `
  * { box-sizing: border-box; }
  ${nunitoExportFontCss()}
  .leseno-pdf-root {
    margin: 0;
    padding: 1.5rem;
    background: #fff;
    color: #18181b;
    font-family: ${NUNITO_FONT_FAMILY};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 25rem;
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
    aspect-ratio: 5 / 8;
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
  .chapter { margin: 0 0 2.5rem; }
  .chapter-title {
    margin: 0 0 1.25rem;
    font-size: 1.35rem;
    font-weight: 800;
    color: #09090b;
  }
  .scene { margin: 0 0 1.75rem; }
  .scene-body p {
    margin: 0 0 0.9rem;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.7;
    text-align: justify;
    hyphens: auto;
    color: #18181b;
  }
  .scene-body p:last-child { margin-bottom: 0; }
  @media print {
    .leseno-pdf-root { padding: 0; }
    .cover-bleed { margin: 0 0 0; break-after: page; }
    .front-matter, .chapter { break-before: page; }
  }
`;

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
    imp.rechteinhaber.trim()
  ) {
    parts.push(`
  <section class="front-matter impressum">
    ${
      imp.hinweis.trim()
        ? `<p>${escapeHtml(imp.hinweis.trim())}</p>`
        : imp.rechteinhaber.trim()
          ? `<p>© ${escapeHtml(imp.jahr.trim() || String(new Date().getFullYear()))} ${escapeHtml(imp.rechteinhaber.trim())}. Alle Rechte vorbehalten.</p>`
          : ""
    }
    ${
      imp.disclaimer.trim()
        ? `<p>${escapeHtml(imp.disclaimer.trim())}</p>`
        : ""
    }
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

/**
 * Self-contained HTML document for preview / print.
 */
export function buildRomanExportDocument(input: RomanExportInput): string {
  const revised = collectRevisedScenes(input.szenen);
  const title = input.title.trim() || "Unbenannter Roman";
  const vorsatz = input.vorsatz ?? emptyVorsatz();
  const cover = (input.coverImageDataUrl ?? "").trim();

  const byChapter = new Map<number, RomanExportScene[]>();
  for (const scene of revised) {
    const list = byChapter.get(scene.kapitelNr) ?? [];
    list.push(scene);
    byChapter.set(scene.kapitelNr, list);
  }

  const chaptersHtml = [...byChapter.entries()]
    .map(([kapitelNr, scenes]) => {
      const scenesHtml = scenes
        .map((scene) => {
          const body = paragraphsToHtml(scene.entwurfRevidiert);
          return `
    <article class="scene">
      <div class="scene-body">${body}</div>
    </article>`;
        })
        .join("\n");
      return `
  <section class="chapter">
    <h2 class="chapter-title">Kapitel ${kapitelNr}</h2>
    ${scenesHtml}
  </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${nunitoGoogleFontsLinkTag()}
  <style>
    body { margin: 0; background: #fff; }
    ${ROMAN_EXPORT_CSS}
  </style>
</head>
<body>
  <div class="leseno-pdf-root">
    <div class="page">
      ${coverHtmlBlock(cover)}
      ${frontMatterHtml(vorsatz)}
      ${chaptersHtml || `<p class="meta">Noch keine revidierten Szenen.</p>`}
    </div>
  </div>
</body>
</html>`;
}

export function romanPdfFilename(title: string): string {
  return `${slugifyFilename(title)}.pdf`;
}

/**
 * Amazon Kindle eBook canvas (marketing cover ratio 1600×2560 → 1:1.6).
 * jsPDF custom format [width, height] in mm — readable device-like page.
 */
export const AMAZON_EBOOK_PAGE_MM = {
  width: 100,
  height: 160,
} as const;

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
  ctx.pdf.addPage(
    [ctx.pageWidth, ctx.pageHeight],
    "portrait",
  );
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
  setNunito(pdf, "semibold", 9);
  pdf.setTextColor(113, 113, 122);
  const label = String(storyPage);
  const tw = pdf.getTextWidth(label);
  pdf.text(label, pageWidth - marginX - tw, pageHeight - 8);
}

function writeFrontMatterPdf(
  ctx: WriteCtx,
  vorsatz: RomanVorsatz,
  options: { startOnFreshPage: boolean },
): void {
  if (!hasUsableVorsatz(vorsatz)) return;

  const t = vorsatz.titelseite;
  if (options.startOnFreshPage) {
    startNewPage(ctx);
  }
  ctx.y = ctx.pageHeight * 0.32;
  setNunito(ctx.pdf, "extrabold", 18);
  ctx.pdf.setTextColor(9, 9, 11);
  writeCenteredLines(
    ctx,
    ctx.pdf.splitTextToSize(
      t.titel.trim() || "Unbenannter Roman",
      ctx.contentWidth,
    ) as string[],
    8,
  );
  if (t.untertitel.trim()) {
    ctx.y += 3;
    setNunito(ctx.pdf, "semibold", 11);
    ctx.pdf.setTextColor(82, 82, 91);
    writeCenteredLines(
      ctx,
      ctx.pdf.splitTextToSize(t.untertitel.trim(), ctx.contentWidth) as string[],
      6,
    );
  }
  if (t.autor.trim()) {
    ctx.y += 8;
    setNunito(ctx.pdf, "bold", 12);
    ctx.pdf.setTextColor(24, 24, 27);
    writeCenteredLines(ctx, [t.autor.trim()], 6);
  }
  if (t.imprint.trim()) {
    ctx.y += 5;
    setNunito(ctx.pdf, "semibold", 9);
    ctx.pdf.setTextColor(113, 113, 122);
    writeCenteredLines(ctx, [t.imprint.trim()], 5);
  }

  const imp = vorsatz.impressum;
  if (
    imp.hinweis.trim() ||
    imp.disclaimer.trim() ||
    imp.rechteinhaber.trim()
  ) {
    startNewPage(ctx);
    ctx.y = ctx.pageHeight * 0.55;
    setNunito(ctx.pdf, "normal", 9);
    ctx.pdf.setTextColor(63, 63, 70);
    const blocks: string[] = [];
    if (imp.hinweis.trim()) {
      blocks.push(imp.hinweis.trim());
    } else if (imp.rechteinhaber.trim()) {
      blocks.push(
        `© ${imp.jahr.trim() || String(new Date().getFullYear())} ${imp.rechteinhaber.trim()}. Alle Rechte vorbehalten.`,
      );
    }
    if (imp.disclaimer.trim()) blocks.push(imp.disclaimer.trim());
    for (const block of blocks) {
      writeLines(
        ctx,
        ctx.pdf.splitTextToSize(block, ctx.contentWidth) as string[],
        5,
      );
      ctx.y += 3;
    }
  }

  if (vorsatz.widmung.trim()) {
    startNewPage(ctx);
    ctx.y = ctx.pageHeight * 0.4;
    setNunito(ctx.pdf, "semibold", 11);
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
    setNunito(ctx.pdf, "semibold", 10);
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
}

/** Full-bleed cover on the current PDF page (object-fit: cover). */
function drawFullBleedCover(
  pdf: jsPDF,
  dataUrl: string,
  pageWidth: number,
  pageHeight: number,
): void {
  const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
  const props = pdf.getImageProperties(dataUrl);
  const imgRatio = props.width / Math.max(1, props.height);
  const pageRatio = pageWidth / pageHeight;
  let drawW: number;
  let drawH: number;
  if (imgRatio > pageRatio) {
    drawH = pageHeight;
    drawW = drawH * imgRatio;
  } else {
    drawW = pageWidth;
    drawH = drawW / imgRatio;
  }
  const x = (pageWidth - drawW) / 2;
  const y = (pageHeight - drawH) / 2;
  pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
}

/**
 * Builds a real text PDF (Nunito embedded) from revised scenes.
 * Amazon eBook page size (1:1.6); page numbers from first story page only.
 */
export async function buildRomanPdfBlob(
  input: RomanExportInput,
): Promise<Blob> {
  const revised = collectRevisedScenes(input.szenen);
  if (!revised.length) {
    throw new Error("Noch keine revidierte Szene zum Export.");
  }

  const vorsatz = input.vorsatz ?? emptyVorsatz();
  const cover = (input.coverImageDataUrl ?? "").trim();
  const hasVorsatz = hasUsableVorsatz(vorsatz);

  const pageWidth = AMAZON_EBOOK_PAGE_MM.width;
  const pageHeight = AMAZON_EBOOK_PAGE_MM.height;

  const pdf = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: "portrait",
  });
  await ensureNunitoOnPdf(pdf);

  const marginX = 12;
  const marginTop = 14;
  /** Leave room for bottom-right page numbers on story pages. */
  const marginBottom = 16;
  const contentWidth = pageWidth - marginX * 2;

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
    writeFrontMatterPdf(ctx, vorsatz, { startOnFreshPage: pageUsed });
    pageUsed = true;
  }

  let lastKapitel: number | null = null;
  /** 1-based jsPDF page index where story numbering starts; 0 = not yet. */
  let storyStartPdfPage = 0;

  for (const scene of revised) {
    const paras = paragraphsPlain(scene.entwurfRevidiert);
    if (!paras.length) continue;

    if (lastKapitel !== scene.kapitelNr) {
      if (pageUsed || lastKapitel !== null) {
        startNewPage(ctx);
      }
      if (storyStartPdfPage === 0) {
        storyStartPdfPage = pdf.getNumberOfPages();
      }
      setNunito(pdf, "extrabold", 14);
      pdf.setTextColor(9, 9, 11);
      writeLines(ctx, [`Kapitel ${scene.kapitelNr}`], 7);
      ctx.y += 3;
      lastKapitel = scene.kapitelNr;
      pageUsed = true;
    } else if (storyStartPdfPage === 0) {
      storyStartPdfPage = pdf.getNumberOfPages();
    }

    setNunito(pdf, "normal", 10);
    pdf.setTextColor(24, 24, 27);
    const lineHeight = 5.4;

    for (const para of paras) {
      const lines = pdf.splitTextToSize(para, contentWidth) as string[];
      writeLines(ctx, lines, lineHeight);
      ctx.y += 2.5;
    }

    ctx.y += 3;
  }

  if (storyStartPdfPage > 0) {
    const totalPages = pdf.getNumberOfPages();
    for (let pdfPage = storyStartPdfPage; pdfPage <= totalPages; pdfPage++) {
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
