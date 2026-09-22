/**
 * Re-encode cover data URLs as compact JPEG for Server Action / DB safety.
 * 1200×1920 PNG base64 can be many MB and crash Electron/IDE on save.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";

const JPEG_QUALITY = 82;

function parseDataUrl(dataUrl: string): { buffer: Buffer } {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return { buffer: Buffer.from(m[1], "base64") };
}

/**
 * Returns a JPEG data URL. Already-small JPEGs are still re-encoded for
 * consistent quality / size.
 */
export async function compressCoverDataUrl(
  dataUrl: string,
  quality = JPEG_QUALITY,
): Promise<string> {
  const { buffer } = parseDataUrl(dataUrl);
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0);
  const out = canvas.toBuffer("image/jpeg", quality);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
