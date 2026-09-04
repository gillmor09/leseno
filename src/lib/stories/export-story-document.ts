/**
 * Builds a self-contained HTML document for PDF preview / print that mirrors the
 * on-screen story card + learned list (floats, Nunito, brand colors).
 * Expects pipeline-sanitized story HTML. Preview opens in-app; save uses print().
 */

import { looksLikeHtml } from "@/lib/stories/looks-like-html";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function storyFontSizeCss(fontSizeEm: number): string {
  return `font-size: ${fontSizeEm}rem;`;
}

/**
 * Maps school-stage body classes to a print font-size (approx. on-screen scale).
 */
export function exportFontSizeForSchoolStage(
  stage: string | null | undefined,
): number {
  if (stage === "vorschule") return 1.5;
  if (stage === "klasse_1" || stage === "klasse_2") return 1.25;
  return 1.125;
}

/**
 * Early readers (Vorschule / 1. Klasse): looser line + letter spacing in PDF.
 */
export function exportSpacingCssForSchoolStage(
  stage: string | null | undefined,
): string {
  if (stage === "vorschule" || stage === "klasse_1") {
    return "line-height: 1.85; letter-spacing: 0.04em;";
  }
  return "line-height: 1.65; letter-spacing: normal;";
}

export type StoryExportInput = {
  storyHtml: string;
  learnedFacts: string[];
  /** Relative rem size for story body. */
  bodyFontSizeRem?: number;
  /** School stage for early-reader spacing in the export. */
  schoolStage?: string | null;
};

/**
 * Full HTML document: story + „Das hast du gelernt“, print-friendly.
 */
export function buildStoryExportDocument(input: StoryExportInput): string {
  const fontSize = input.bodyFontSizeRem ?? 1.125;
  const spacingCss = exportSpacingCssForSchoolStage(input.schoolStage);
  const storyInner = looksLikeHtml(input.storyHtml)
    ? input.storyHtml
    : `<p>${escapeHtml(input.storyHtml).replaceAll("\n", "<br />")}</p>`;

  const factsBlock =
    input.learnedFacts.length > 0
      ? `
  <section class="facts" aria-label="Das hast du gelernt">
    <div class="facts-head">
      <span class="facts-icon" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">Wissen</p>
        <h2>Das hast du gelernt</h2>
      </div>
    </div>
    <ol class="facts-list">
      ${input.learnedFacts
        .map(
          (fact, index) => `
      <li>
        <span class="fact-num">${index + 1}</span>
        <span class="fact-text">${escapeHtml(fact)}</span>
      </li>`,
        )
        .join("")}
    </ol>
  </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Leseno — Deine Geschichte</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.5rem;
      background: #fff;
      color: #09090b;
      font-family: Nunito, ui-sans-serif, system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      max-width: 48rem;
      margin: 0 auto;
      display: grid;
      gap: 1.5rem;
    }
    .card {
      background: #fff;
      border-radius: 1.75rem;
      padding: 2rem;
      border: 1px solid rgb(9 9 11 / 0.1);
    }
    .eyebrow {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #c2410c;
    }
    .brand {
      margin: 0 0 0.75rem;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a1a1aa;
    }
    .story-html {
      margin-top: 1rem;
      color: #3f3f46;
      ${storyFontSizeCss(fontSize)}
      ${spacingCss}
    }
    .story-html::after {
      content: "";
      display: table;
      clear: both;
    }
    .story-html h1 {
      margin: 0 0 1rem;
      font-size: 1.25em;
      font-weight: 800;
      line-height: 1.2;
      color: #09090b;
    }
    .story-html h2 {
      margin: 1.5rem 0 0.75rem;
      font-size: 1.1em;
      font-weight: 800;
      color: #09090b;
    }
    .story-html p {
      margin: 0.75rem 0 0;
    }
    .story-html p:first-child { margin-top: 0; }
    .story-html strong, .story-html b {
      font-weight: 800;
      color: #18181b;
    }
    .story-html em { font-style: italic; }
    .story-html span.silbe--a { color: #1d4ed8; }
    .story-html span.silbe--b { color: #dc2626; }
    .story-html img.story-illustration {
      display: block;
      width: 256px;
      max-width: min(256px, 45%);
      height: auto;
      border-radius: 1rem;
      box-shadow:
        0 4px 6px -1px rgb(0 0 0 / 0.1),
        0 2px 4px -2px rgb(0 0 0 / 0.1);
      margin-top: 1rem !important;
      margin-bottom: 1rem !important;
      vertical-align: top;
    }
    .story-html img.story-illustration--left {
      float: left !important;
      margin-right: 1rem !important;
      margin-left: 0 !important;
    }
    .story-html img.story-illustration--right {
      float: right !important;
      margin-left: 1rem !important;
      margin-right: 0 !important;
    }
    .story-html p:has(> img.story-illustration:first-child) {
      margin-top: 0 !important;
    }
    .story-html p:has(+ p > img.story-illustration:first-child) {
      margin-bottom: 0 !important;
    }
    .facts-head {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .facts-icon {
      flex-shrink: 0;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 1rem;
      background: #facc15;
    }
    .facts h2 {
      margin: 0.25rem 0 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #09090b;
    }
    .facts-list {
      list-style: none;
      margin: 1.25rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }
    .facts-list li {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      background: #f4f4f5;
      border-radius: 1rem;
      padding: 0.75rem 1rem;
      font-size: 1.125rem;
      line-height: 1.55;
      color: #3f3f46;
    }
    .fact-num {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      margin-top: 0.125rem;
      border-radius: 9999px;
      background: #c2410c;
      color: #fff;
      font-size: 0.875rem;
      font-weight: 800;
    }
    @media print {
      body { padding: 0; }
      .card {
        border: none;
        border-radius: 0;
        padding: 0 0 1.5rem;
      }
      .facts-list li {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="card story">
      <p class="brand">Leseno</p>
      <p class="eyebrow">Deine Geschichte</p>
      <div class="story-html">${storyInner}</div>
    </section>
    ${factsBlock}
  </div>
</body>
</html>`;
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

/**
 * @deprecated Prefer in-app `StoryPdfPreviewDialog` + `buildStoryExportDocument`.
 * Opens the system print dialog via a hidden iframe (legacy).
 */
export async function openStoryPrintDialog(
  input: StoryExportInput,
): Promise<void> {
  const html = buildStoryExportDocument(input);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "PDF-Export");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = iframe.contentDocument;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    throw new Error("PDF-Export konnte nicht gestartet werden.");
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  try {
    await waitForImages(frameDoc);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    frameWindow.focus();
    frameWindow.print();
  } finally {
    window.setTimeout(() => iframe.remove(), 1500);
  }
}
