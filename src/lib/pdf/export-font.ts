/**
 * Shared Nunito loading for client PDF/HTML exports (preview iframe + html2pdf).
 * next/font on the app shell does not apply inside export iframes / off-screen hosts.
 */

/** Weights used in Leseno UI / PDF body (regular → extrabold). */
export const NUNITO_GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap";

export const NUNITO_FONT_FAMILY =
  '"Nunito", var(--font-nunito, ui-sans-serif), system-ui, sans-serif';

/** `<link>` for standalone export HTML documents. */
export function nunitoGoogleFontsLinkTag(): string {
  return `<link rel="stylesheet" href="${NUNITO_GOOGLE_FONTS_HREF}" />`;
}

/** CSS block: family + ensure inheritance in export roots. */
export function nunitoExportFontCss(): string {
  return `
    body,
    .leseno-pdf-root,
    .leseno-pdf-root * {
      font-family: ${NUNITO_FONT_FAMILY};
    }
  `;
}

/**
 * Injects a stylesheet link into a host element (html2pdf off-screen tree).
 */
export function appendNunitoStylesheet(host: HTMLElement): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = NUNITO_GOOGLE_FONTS_HREF;
  host.prepend(link);
  return link;
}

/**
 * Waits until Nunito is usable for canvas/PDF rasterization.
 */
export async function waitForNunitoFonts(
  root: ParentNode = document,
): Promise<void> {
  const fonts = (root as Document).fonts ?? document.fonts;
  if (!fonts) {
    await new Promise((r) => window.setTimeout(r, 400));
    return;
  }

  try {
    await Promise.all([
      fonts.load(`400 16px Nunito`),
      fonts.load(`600 16px Nunito`),
      fonts.load(`700 16px Nunito`),
      fonts.load(`800 16px Nunito`),
    ]);
  } catch {
    // Fall through — still wait for ready below.
  }

  try {
    await fonts.ready;
  } catch {
    // ignore
  }

  // Extra beat so html2canvas sees computed styles after @font-face apply.
  await new Promise((r) => window.setTimeout(r, 200));
}
