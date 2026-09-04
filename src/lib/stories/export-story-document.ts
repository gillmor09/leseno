/**
 * Builds a self-contained HTML document for PDF export (html2pdf.js).
 * Mirrors the on-screen story card + learned list (floats, Nunito, brand colors).
 * Expects pipeline-sanitized story HTML.
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
    <p class="eyebrow">Wissen</p>
    <h2>Das hast du gelernt</h2>
    <ul class="facts-list">
      ${input.learnedFacts
        .map(
          (fact) => `
      <li>${escapeHtml(fact)}</li>`,
        )
        .join("")}
    </ul>
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
    body,
    .leseno-pdf-root {
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
      padding: 0;
      border: none;
      border-radius: 0;
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
      background: #f4f4f5;
      border-radius: 1rem;
      padding: 0.75rem 1rem;
      font-size: 1.125rem;
      line-height: 1.55;
      color: #3f3f46;
    }
    @media print {
      body,
      .leseno-pdf-root { padding: 0; }
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

function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
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
 * Renders the export HTML in the main document and converts it to a PDF `Blob`
 * via html2pdf.js. Host sits on-screen (clipped) so html2canvas gets real pixels.
 */
export async function buildStoryPdfBlob(
  input: StoryExportInput,
): Promise<Blob> {
  const html = buildStoryExportDocument(input);
  const parsed = new DOMParser().parseFromString(html, "text/html");

  const host = document.createElement("div");
  host.setAttribute("data-leseno-pdf-export", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "794px",
    margin: "0",
    padding: "0",
    background: "#ffffff",
    zIndex: "1",
    pointerEvents: "none",
    opacity: "1",
  });

  for (const styleEl of Array.from(parsed.querySelectorAll("style"))) {
    host.appendChild(styleEl.cloneNode(true));
  }

  const root = document.createElement("div");
  root.className = "leseno-pdf-root";
  root.innerHTML = parsed.body.innerHTML;
  host.appendChild(root);
  document.body.appendChild(host);

  try {
    await waitForImages(host);
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    const mod = await import("html2pdf.js");
    const html2pdf = (mod.default ?? mod) as typeof mod.default;

    const worker = html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: "leseno-geschichte.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: -window.scrollY,
          windowWidth: root.scrollWidth || 794,
          windowHeight: root.scrollHeight || 1123,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(root);

    // Force canvas → pdf, then read blob (more reliable than chaining outputPdf alone).
    await worker.toPdf();
    const pdf = (await worker.get("pdf")) as {
      output: (type: string) => Blob;
    };
    const raw = pdf.output("blob");
    const blob = new Blob([raw], { type: "application/pdf" });

    const header = await blob.slice(0, 5).text();
    if (!header.startsWith("%PDF") || blob.size < 200) {
      throw new Error("PDF kam leer oder ungültig zurück.");
    }
    return blob;
  } finally {
    host.remove();
  }
}
