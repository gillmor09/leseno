/**
 * Admin roman export: HTML preview + text PDF (jsPDF + embedded Nunito).
 * Text PDFs avoid blank html2canvas captures on long novels.
 */

import { jsPDF } from "jspdf";
import {
  NUNITO_FONT_FAMILY,
  nunitoExportFontCss,
  nunitoGoogleFontsLinkTag,
} from "@/lib/pdf/export-font";
import { ensureNunitoOnPdf, setNunito } from "@/lib/pdf/jspdf-nunito";
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
  /** Total scene count (for Zwischenstand note). */
  totalSzenen?: number;
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
    max-width: 42rem;
    margin: 0 auto;
  }
  .cover {
    margin-bottom: 1rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e4e4e7;
  }
  .eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #c2410c;
  }
  .title {
    margin: 0 0 0.75rem;
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.25;
    color: #09090b;
  }
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
  .scene-title {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #a1a1aa;
  }
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
    .chapter { break-before: page; }
    .chapter:first-of-type { break-before: auto; }
  }
`;

/**
 * Self-contained HTML document for preview / print.
 */
export function buildRomanExportDocument(input: RomanExportInput): string {
  const revised = collectRevisedScenes(input.szenen);
  const total = input.totalSzenen ?? input.szenen.length;
  const title = input.title.trim() || "Unbenannter Roman";
  const generated = new Date().toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
      <h3 class="scene-title">Szene ${scene.kapitelNr}.${scene.szenenNr}</h3>
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
  <title>${escapeHtml(title)} — Zwischenstand</title>
  ${nunitoGoogleFontsLinkTag()}
  <style>
    body { margin: 0; background: #fff; }
    ${ROMAN_EXPORT_CSS}
  </style>
</head>
<body>
  <div class="leseno-pdf-root">
    <div class="page">
      <header class="cover">
        <p class="eyebrow">Leseno · Roman-Zwischenstand</p>
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="meta">
          ${revised.length} revidierte Szene(n)
          ${total > 0 ? ` von ${total}` : ""}
          · erzeugt ${escapeHtml(generated)}
        </p>
      </header>
      ${chaptersHtml || `<p class="meta">Noch keine revidierten Szenen.</p>`}
    </div>
  </div>
</body>
</html>`;
}

export function romanPdfFilename(title: string): string {
  return `${slugifyFilename(title)}-zwischenstand.pdf`;
}

type WriteCtx = {
  pdf: jsPDF;
  y: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  pageHeight: number;
};

function ensureSpace(ctx: WriteCtx, neededMm: number): void {
  if (ctx.y + neededMm <= ctx.pageHeight - ctx.marginBottom) return;
  ctx.pdf.addPage();
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

/**
 * Builds a real text PDF (Nunito embedded) from revised scenes.
 */
export async function buildRomanPdfBlob(
  input: RomanExportInput,
): Promise<Blob> {
  const revised = collectRevisedScenes(input.szenen);
  if (!revised.length) {
    throw new Error("Noch keine revidierte Szene zum Export.");
  }

  const total = input.totalSzenen ?? input.szenen.length;
  const title = input.title.trim() || "Unbenannter Roman";
  const generated = new Date().toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });
  await ensureNunitoOnPdf(pdf);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 18;
  const marginTop = 18;
  const marginBottom = 18;
  const contentWidth = pageWidth - marginX * 2;

  const ctx: WriteCtx = {
    pdf,
    y: marginTop,
    marginX,
    marginTop,
    marginBottom,
    contentWidth,
    pageHeight,
  };

  // Cover
  setNunito(pdf, "extrabold", 10);
  pdf.setTextColor(194, 65, 12);
  writeLines(ctx, ["LESENO · ROMAN-ZWISCHENSTAND"], 6);

  ctx.y += 4;
  setNunito(pdf, "extrabold", 22);
  pdf.setTextColor(9, 9, 11);
  const titleLines = pdf.splitTextToSize(title, contentWidth) as string[];
  writeLines(ctx, titleLines, 10);

  ctx.y += 4;
  setNunito(pdf, "semibold", 11);
  pdf.setTextColor(113, 113, 122);
  const meta = `${revised.length} revidierte Szene(n)${
    total > 0 ? ` von ${total}` : ""
  } · erzeugt ${generated}`;
  writeLines(ctx, pdf.splitTextToSize(meta, contentWidth) as string[], 6);

  ctx.y += 6;
  pdf.setDrawColor(228, 228, 231);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, ctx.y, pageWidth - marginX, ctx.y);
  ctx.y += 10;

  let lastKapitel: number | null = null;

  for (const scene of revised) {
    const paras = paragraphsPlain(scene.entwurfRevidiert);
    if (!paras.length) continue;

    if (lastKapitel !== scene.kapitelNr) {
      ensureSpace(ctx, 16);
      if (lastKapitel !== null) {
        ctx.pdf.addPage();
        ctx.y = marginTop;
      }
      setNunito(pdf, "extrabold", 16);
      pdf.setTextColor(9, 9, 11);
      writeLines(ctx, [`Kapitel ${scene.kapitelNr}`], 9);
      ctx.y += 4;
      lastKapitel = scene.kapitelNr;
    }

    ensureSpace(ctx, 12);
    setNunito(pdf, "extrabold", 10);
    pdf.setTextColor(161, 161, 170);
    writeLines(
      ctx,
      [`SZENE ${scene.kapitelNr}.${scene.szenenNr}`],
      6,
    );
    ctx.y += 2;

    setNunito(pdf, "normal", 11);
    pdf.setTextColor(24, 24, 27);
    const lineHeight = 6.2;

    for (const para of paras) {
      const lines = pdf.splitTextToSize(para, contentWidth) as string[];
      writeLines(ctx, lines, lineHeight);
      ctx.y += 3;
    }

    ctx.y += 4;
  }

  const raw = pdf.output("blob");
  const blob = new Blob([raw], { type: "application/pdf" });
  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF") || blob.size < 500) {
    throw new Error("PDF kam leer oder ungültig zurück.");
  }
  return blob;
}
