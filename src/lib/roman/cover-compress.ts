/**
 * Force cover pixels to exact {@link ROMAN_COVER_SIZE} (1600×2400).
 * GPT Image usually hits it; if the API returns a near-miss, we snap once.
 */

import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const JPEG_QUALITY = 90;

function parseDataUrl(dataUrl: string): { buffer: Buffer; isJpeg: boolean } {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1] || !m[2]) throw new Error("Ungültiges Cover-Bild (data URL).");
  const mime = m[1].toLowerCase();
  return {
    buffer: Buffer.from(m[2], "base64"),
    isJpeg: mime === "image/jpeg" || mime === "image/jpg",
  };
}

function drawCoverFit(
  image: Image,
  ctx: SKRSContext2D,
  tw: number,
  th: number,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  if (image.width === tw && image.height === th) {
    ctx.drawImage(image, 0, 0);
    return;
  }
  const scale = Math.max(tw / image.width, th / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (tw - dw) / 2, (th - dh) / 2, dw, dh);
}

/**
 * Returns a JPEG data URL that is exactly 1600×2400.
 * Exact JPEG inputs are returned unchanged (no resample, no re-encode).
 */
export async function ensureRomanCoverExactSize(
  dataUrl: string,
  quality = JPEG_QUALITY,
): Promise<string> {
  const { buffer, isJpeg } = parseDataUrl(dataUrl);
  const image = await loadImage(buffer);
  const tw = ROMAN_COVER_SIZE.width;
  const th = ROMAN_COVER_SIZE.height;

  if (image.width === tw && image.height === th && isJpeg) {
    return dataUrl.trim();
  }

  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext("2d");
  drawCoverFit(image, ctx, tw, th);
  const out = canvas.toBuffer("image/jpeg", quality);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * @deprecated Prefer {@link ensureRomanCoverExactSize}.
 * Alias kept for Clever-Infografik call sites.
 */
export async function compressCoverDataUrl(
  dataUrl: string,
  quality = JPEG_QUALITY,
): Promise<string> {
  return ensureRomanCoverExactSize(dataUrl, quality);
}
