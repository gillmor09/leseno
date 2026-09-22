/**
 * Clever erzählt cover branding: paste two PNGs 1:1 onto Flux artwork.
 * No frames, no backgrounds, no extra type — only the PNG pixels (with alpha).
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Series badge — `public/clever_erzählt_300.png` (native 300×180). */
export const CLEVER_SERIES_BADGE_FILE = "clever_erzählt_300.png";
/** Publisher mark — `public/leseno-komplett-256.png` (native 256×256). */
export const LESENO_MARK_FILE = "leseno-komplett-256.png";

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return Buffer.from(m[1], "base64");
}

function readPublicPng(fileName: string): Buffer {
  return readFileSync(/*turbopackIgnore: true*/ path.join(PUBLIC_DIR, fileName));
}

/**
 * Draw series PNG top-center + leseno PNG bottom-right at native pixel size (1:1).
 * Transparent PNG alpha shows the cover art underneath — no fill, no frame.
 */
export async function overlayCleverCoverLogos(input: {
  imageDataUrl: string;
}): Promise<string> {
  const coverBuf = parseDataUrl(input.imageDataUrl);
  const cover = await loadImage(coverBuf);
  const width = cover.width;
  const height = cover.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // Preserve PNG alpha when compositing logos.
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(cover, 0, 0, width, height);

  const badge = await loadImage(readPublicPng(CLEVER_SERIES_BADGE_FILE));
  const mark = await loadImage(readPublicPng(LESENO_MARK_FILE));

  // 1:1 native pixels — never stretch; only shrink if cover is smaller than asset.
  const badgeW = Math.min(badge.width, Math.round(width * 0.42));
  const badgeH = Math.round((badgeW / badge.width) * badge.height);
  const badgeX = Math.round((width - badgeW) / 2);
  const badgeY = Math.max(24, Math.round(height * 0.035));
  ctx.drawImage(badge, badgeX, badgeY, badgeW, badgeH);

  const markW = Math.min(mark.width, Math.round(width * 0.22));
  const markH = Math.round((markW / mark.width) * mark.height);
  const markMargin = Math.max(24, Math.round(width * 0.035));
  const markX = width - markMargin - markW;
  const markY = height - markMargin - markH;
  ctx.drawImage(mark, markX, markY, markW, markH);

  const out = canvas.toBuffer("image/jpeg", 90);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
