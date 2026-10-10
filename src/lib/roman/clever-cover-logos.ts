/**
 * Clever erzählt / Roman cover branding: paste PNGs 1:1 onto artwork.
 * Series badge top-center; leseno mark bottom-center (`leseno-vogel-neu.png`).
 */

import {
  createCanvas,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Series badge — `public/clever_erzählt_300.png` (native 300×180). */
export const CLEVER_SERIES_BADGE_FILE = "clever_erzählt_300.png";
/** Publisher mark — `public/leseno-vogel-neu.png`. */
export const LESENO_MARK_FILE = "leseno-vogel-neu.png";

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

/** Draw leseno mark bottom-center (scaled ≤18% of cover width). */
export async function drawLesenoMarkBottomCenter(
  ctx: SKRSContext2D,
  width: number,
  height: number,
): Promise<void> {
  const mark = await loadImage(readPublicPng(LESENO_MARK_FILE));
  const markW = Math.min(mark.width, Math.round(width * 0.18));
  const markH = Math.round((markW / mark.width) * mark.height);
  const marginBottom = Math.max(28, Math.round(height * 0.04));
  const markX = Math.round((width - markW) / 2);
  const markY = height - marginBottom - markH;
  ctx.drawImage(mark, markX, markY, markW, markH);
}

/** @deprecated Use drawLesenoMarkBottomCenter. */
export const drawLesenoMarkBottomLeft = drawLesenoMarkBottomCenter;
/** @deprecated Use drawLesenoMarkBottomCenter. */
export const drawLesenoMarkBottomRight = drawLesenoMarkBottomCenter;

/**
 * Draw series PNG top-center + leseno PNG bottom-center at native pixel size (1:1).
 * Transparent PNG alpha shows the cover art underneath — no fill, no frame.
 */
export async function overlayCleverCoverLogos(input: {
  imageDataUrl: string;
}): Promise<string> {
  const coverBuf = parseDataUrl(input.imageDataUrl);
  const cover = await loadImage(coverBuf);
  const width = ROMAN_COVER_SIZE.width;
  const height = ROMAN_COVER_SIZE.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // Canonical 1600×2400 frame; fill if the model returned a near-miss size.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (cover.width === width && cover.height === height) {
    ctx.drawImage(cover, 0, 0);
  } else {
    const scale = Math.max(width / cover.width, height / cover.height);
    const dw = cover.width * scale;
    const dh = cover.height * scale;
    ctx.drawImage(cover, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }

  const badge = await loadImage(readPublicPng(CLEVER_SERIES_BADGE_FILE));

  // 1:1 native pixels — never stretch; only shrink if cover is smaller than asset.
  const badgeW = Math.min(badge.width, Math.round(width * 0.42));
  const badgeH = Math.round((badgeW / badge.width) * badge.height);
  const badgeX = Math.round((width - badgeW) / 2);
  const badgeY = Math.max(24, Math.round(height * 0.035));
  ctx.drawImage(badge, badgeX, badgeY, badgeW, badgeH);

  await drawLesenoMarkBottomCenter(ctx, width, height);

  const out = canvas.toBuffer("image/jpeg", 90);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
