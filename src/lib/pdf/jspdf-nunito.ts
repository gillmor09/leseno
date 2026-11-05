/**
 * Embed Nunito into jsPDF from `/public/fonts` — real text PDFs, no blank canvases.
 * Client: fetch. Server (Node): readFile from public/.
 * Uses the full SemiBold TTF (incl. German umlauts) for all weights.
 */

import type { jsPDF } from "jspdf";

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in browsers; Node 18+ has it on global too.
  return btoa(binary);
}

/** Full Nunito SemiBold (vendored) — covers DE umlauts; used for all PDF styles. */
const NUNITO_TTF_PATH = "/fonts/Nunito-SemiBold.ttf";
const NUNITO_VFS = "Nunito-SemiBold.ttf";
const STYLES = ["normal", "semibold", "bold", "extrabold"] as const;

let fontBase64: string | null = null;

async function loadNunitoBase64(): Promise<string> {
  if (fontBase64) return fontBase64;

  if (typeof window === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const filePath = join(process.cwd(), "public", "fonts", "Nunito-SemiBold.ttf");
    const buf = await readFile(filePath);
    fontBase64 = arrayBufferToBase64(buf);
    return fontBase64;
  }

  const res = await fetch(NUNITO_TTF_PATH);
  if (!res.ok) {
    throw new Error(`Nunito-Schrift fehlt (${NUNITO_TTF_PATH}).`);
  }
  fontBase64 = arrayBufferToBase64(await res.arrayBuffer());
  return fontBase64;
}

/**
 * Registers Nunito on a jsPDF instance (cached fetch / disk read).
 */
export async function ensureNunitoOnPdf(pdf: jsPDF): Promise<void> {
  const base64 = await loadNunitoBase64();
  pdf.addFileToVFS(NUNITO_VFS, base64);
  for (const style of STYLES) {
    pdf.addFont(NUNITO_VFS, "Nunito", style);
  }
  pdf.setFont("Nunito", "normal");
}

export type NunitoPdfStyle = (typeof STYLES)[number];

export function setNunito(
  pdf: jsPDF,
  style: NunitoPdfStyle,
  sizePt: number,
): void {
  pdf.setFont("Nunito", style);
  pdf.setFontSize(sizePt);
}
