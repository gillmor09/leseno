/**
 * Overlays exact Winkel title on a social image in real Nunito SemiBold (white).
 * Glyph outlines come from the vendored Nunito SemiBold TTF via opentype.js (per-glyph paths).
 * Placement: top or bottom band — whichever is darker for white-text contrast.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { parse, type Font as OtFont } from "opentype.js";

/** Vendored brand font — keep path statically scoped for Turbopack tracing. */
const NUNITO_SEMIBOLD_TTF = path.join(
  process.cwd(),
  "src",
  "assets",
  "fonts",
  "Nunito-SemiBold.ttf",
);

let nunitoFont: OtFont | null = null;

function readFontArrayBuffer(fontPath: string): ArrayBuffer {
  const nodeBuf = readFileSync(/*turbopackIgnore: true*/ fontPath);
  return nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  );
}

function getNunitoFont(): OtFont {
  if (nunitoFont) return nunitoFont;
  let font: OtFont;
  try {
    font = parse(readFontArrayBuffer(NUNITO_SEMIBOLD_TTF));
  } catch (error) {
    throw new Error(
      `Nunito SemiBold (TTF) fehlt oder ist ungültig unter ${NUNITO_SEMIBOLD_TTF}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  // Smoke-check: rounded Nunito 'o' must exist as a real glyph outline.
  const o = font.charToGlyph("o");
  if (!o || (o.advanceWidth ?? 0) < 100 || o.path.commands.length < 4) {
    throw new Error(`Nunito SemiBold ungültig (${NUNITO_SEMIBOLD_TTF}).`);
  }
  nunitoFont = font;
  return font;
}

function measureLineWidth(font: OtFont, text: string, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm;
  let width = 0;
  for (const ch of text) {
    width += (font.charToGlyph(ch).advanceWidth ?? 0) * scale;
  }
  return width;
}

function wrapLines(
  font: OtFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${current} ${word}`;
    if (measureLineWidth(font, candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Ungültiges Bild (kein data-URL).");
  }
  return {
    mime: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

/**
 * Mean relative luminance (0–255) of a horizontal band. Sampled for speed.
 */
function meanBandLuminance(
  ctx: {
    getImageData: (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
    ) => { data: Uint8ClampedArray; width: number };
  },
  width: number,
  y0: number,
  bandHeight: number,
): number {
  const y = Math.max(0, Math.floor(y0));
  const h = Math.max(1, Math.floor(bandHeight));
  const { data, width: rowW } = ctx.getImageData(0, y, width, h);
  const step = Math.max(1, Math.floor(Math.min(width, h) / 48));
  let sum = 0;
  let count = 0;
  for (let row = 0; row < h; row += step) {
    for (let col = 0; col < width; col += step) {
      const i = (row * rowW + col) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 128;
}

/**
 * Fills one centered line using per-glyph Nunito outlines (no GSUB / no ctx.font).
 */
function fillNunitoLine(
  ctx: {
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    bezierCurveTo(
      cp1x: number,
      cp1y: number,
      cp2x: number,
      cp2y: number,
      x: number,
      y: number,
    ): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    closePath(): void;
    fill(): void;
  },
  font: OtFont,
  text: string,
  fontSize: number,
  centerX: number,
  baselineY: number,
): void {
  const scale = fontSize / font.unitsPerEm;
  let x = centerX - measureLineWidth(font, text, fontSize) / 2;

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const otPath = glyph.getPath(x, baselineY, fontSize);
    ctx.beginPath();
    for (const cmd of otPath.commands) {
      if (cmd.type === "M") ctx.moveTo(cmd.x, cmd.y);
      else if (cmd.type === "L") ctx.lineTo(cmd.x, cmd.y);
      else if (cmd.type === "C") {
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      } else if (cmd.type === "Q") {
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      } else if (cmd.type === "Z") ctx.closePath();
    }
    ctx.fill();
    x += (glyph.advanceWidth ?? 0) * scale;
  }
}

/**
 * Draws `overlayText` exactly (no paraphrase) in white Nunito SemiBold outlines.
 * Returns a PNG data URL so model detail stays sharp.
 */
export async function overlayExactAngleTextOnImage(input: {
  imageDataUrl: string;
  overlayText: string;
}): Promise<string> {
  const text = input.overlayText.trim().replace(/\s+/g, " ");
  if (!text) {
    return input.imageDataUrl;
  }

  const font = getNunitoFont();

  const { buffer } = parseDataUrl(input.imageDataUrl);
  const image = await loadImage(buffer);
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0, width, height);

  // Compare top vs bottom band — white type reads better on the darker edge.
  const bandH = Math.round(height * 0.3);
  const topLuma = meanBandLuminance(ctx, width, 0, bandH);
  const bottomLuma = meanBandLuminance(ctx, width, height - bandH, bandH);
  const placeTop = topLuma < bottomLuma - 4; // slight bias to bottom on ties

  if (placeTop) {
    const gradient = ctx.createLinearGradient(0, 0, 0, bandH);
    gradient.addColorStop(0, "rgba(0,0,0,0.38)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.16)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, bandH);
  } else {
    const gradient = ctx.createLinearGradient(0, height - bandH, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.16)");
    gradient.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height - bandH, width, bandH);
  }

  const padX = Math.round(width * 0.06);
  const maxTextWidth = width - padX * 2;
  let fontSize = Math.round(width * 0.068);
  fontSize = Math.min(78, Math.max(34, fontSize));

  let lines: string[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    lines = wrapLines(font, text, fontSize, maxTextWidth);
    if (lines.length <= 3) break;
    fontSize = Math.max(26, fontSize - 4);
  }

  const lineHeight = Math.round(fontSize * 1.18);
  const blockHeight = lines.length * lineHeight;
  const edgePad = Math.round(height * 0.075);
  // Baseline for first line (opentype y is baseline, not middle).
  const firstBaseline = placeTop
    ? edgePad + fontSize * 0.85
    : height - edgePad - blockHeight / 2 + fontSize * 0.35;

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = Math.round(fontSize * 0.22);
  ctx.shadowOffsetY = Math.round(fontSize * 0.05);

  for (let i = 0; i < lines.length; i++) {
    fillNunitoLine(
      ctx,
      font,
      lines[i]!,
      fontSize,
      width / 2,
      firstBaseline + i * lineHeight,
    );
  }

  const out = canvas.toBuffer("image/png");
  return `data:image/png;base64,${out.toString("base64")}`;
}
