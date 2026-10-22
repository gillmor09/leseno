/**
 * Force cover pixels to exact {@link ROMAN_COVER_SIZE} (1600×2400).
 * Output is always JPEG RGB with {@link ROMAN_COVER_PPI} density metadata.
 */

import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import sharp from "sharp";
import {
  ROMAN_COVER_PPI,
  ROMAN_COVER_SIZE,
} from "@/lib/roman/cover-size";

const JPEG_QUALITY = 90;

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1] || !m[2]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return Buffer.from(m[2], "base64");
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

async function jpegWithCoverDpi(
  jpegBuffer: Buffer,
  quality: number,
): Promise<string> {
  const out = await sharp(jpegBuffer)
    .withMetadata({ density: ROMAN_COVER_PPI })
    .jpeg({ quality, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * Returns a JPEG data URL that is exactly 1600×2400 @ 300 ppi (RGB).
 */
export async function ensureRomanCoverExactSize(
  dataUrl: string,
  quality = JPEG_QUALITY,
): Promise<string> {
  const buffer = parseDataUrl(dataUrl);
  const image = await loadImage(buffer);
  const tw = ROMAN_COVER_SIZE.width;
  const th = ROMAN_COVER_SIZE.height;

  let jpeg: Buffer;
  if (image.width === tw && image.height === th) {
    jpeg = buffer;
  } else {
    const canvas = createCanvas(tw, th);
    const ctx = canvas.getContext("2d");
    drawCoverFit(image, ctx, tw, th);
    jpeg = canvas.toBuffer("image/jpeg", quality);
  }

  return jpegWithCoverDpi(jpeg, quality);
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
