/**
 * Re-encode cover data URLs as compact JPEG for Server Action / DB safety.
 * Always normalizes to {@link ROMAN_COVER_SIZE} (print target 1600×2560 @ 300 ppi).
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const JPEG_QUALITY = 82;

function parseDataUrl(dataUrl: string): { buffer: Buffer } {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return { buffer: Buffer.from(m[1], "base64") };
}

/**
 * Returns a JPEG data URL at {@link ROMAN_COVER_SIZE}.
 * Already-small JPEGs are still re-encoded for consistent quality / size.
 * Scales with object-fit: cover when the model output differs (e.g. IONOS 1280×2048).
 */
export async function compressCoverDataUrl(
  dataUrl: string,
  quality = JPEG_QUALITY,
): Promise<string> {
  const { buffer } = parseDataUrl(dataUrl);
  const image = await loadImage(buffer);
  const tw = ROMAN_COVER_SIZE.width;
  const th = ROMAN_COVER_SIZE.height;
  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  if (image.width === tw && image.height === th) {
    ctx.drawImage(image, 0, 0);
  } else {
    const scale = Math.max(tw / image.width, th / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (tw - dw) / 2, (th - dh) / 2, dw, dh);
  }
  const out = canvas.toBuffer("image/jpeg", quality);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
