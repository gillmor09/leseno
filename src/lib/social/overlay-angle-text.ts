/**
 * Overlays exact titles on social images in real Nunito SemiBold (opentype glyph paths).
 * Winkel: white type on dark edge gradient.
 * Marketing: zinc-700/80 dark card + light orange checklist, solid zinc-700 footer.
 * Frage: bg3 + orange-800 question + same brand footer (logo + leseno).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { parse, type Font as OtFont } from "opentype.js";

/** Vendored brand font — keep path statically scoped for Turbopack tracing. */
const NUNITO_SEMIBOLD_TTF = path.join(
  process.cwd(),
  "src",
  "assets",
  "fonts",
  "Nunito-SemiBold.ttf",
);

const LESENO_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "landing",
  "vogel-hell.webp",
);

const FRAGE_BG_PATH = path.join(process.cwd(), "public", "bg3.jpg");

/** Marketing / Frage social posts are composed at this square size. */
export const MARKETING_SOCIAL_IMAGE_PX = 1024;

/** Headline size on 1024² Frage images (~text-7xl / feed-readable). */
const FRAGE_TEXT_BASE_PX = 80;
/** Vivid brand orange on light bg3 — strong contrast, still punchy in-feed. */
const FRAGE_TEXT_COLOR = "#9a3412"; // orange-800

const MARKETING_ORANGE = "#fdba74"; // orange-300 — light & punchy on zinc-700 card
const MARKETING_CARD_FILL = "rgba(63, 63, 70, 0.8)"; // zinc-700/80
const FOOTER_ZINC = "#3f3f46"; // zinc-700 solid
const MARKETING_CHECK_MARK = "#fff7ed"; // warm cream on orange badge

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

function meanBandLuminance(
  ctx: SKRSContext2D,
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

function fillNunitoLine(
  ctx: SKRSContext2D,
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

/** SemiBold stroked + filled — reads as Bold without a separate Bold TTF. */
function fillNunitoLineBold(
  ctx: SKRSContext2D,
  font: OtFont,
  text: string,
  fontSize: number,
  centerX: number,
  baselineY: number,
): void {
  const scale = fontSize / font.unitsPerEm;
  let x = centerX - measureLineWidth(font, text, fontSize) / 2;
  const strokeW = Math.max(1.2, fontSize * 0.045);

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
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = strokeW;
    ctx.stroke();
    ctx.fill();
    x += (glyph.advanceWidth ?? 0) * scale;
  }
}

/** Left-aligned bold Nunito (marketing benefit rows). */
function fillNunitoLineBoldLeft(
  ctx: SKRSContext2D,
  font: OtFont,
  text: string,
  fontSize: number,
  leftX: number,
  baselineY: number,
): void {
  const scale = fontSize / font.unitsPerEm;
  let x = leftX;
  const strokeW = Math.max(1.2, fontSize * 0.045);

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
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = strokeW;
    ctx.stroke();
    ctx.fill();
    x += (glyph.advanceWidth ?? 0) * scale;
  }
}

/**
 * Benefit-list check badge (circle + tick) — clearer than thumbs-up for feature claims.
 */
function drawCheckBadge(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = MARKETING_ORANGE;
  ctx.fill();

  const s = radius * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.15, cy + s * 0.65);
  ctx.lineTo(cx + s * 0.85, cy - s * 0.55);
  ctx.strokeStyle = MARKETING_CHECK_MARK;
  ctx.lineWidth = Math.max(2.5, radius * 0.28);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Splits marketing titles joined with “ · ” into stacked benefit lines. */
function parseMarketingBenefitLines(overlayText: string): string[] {
  const parts = overlayText
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [overlayText.trim()].filter(Boolean);
}

function fillRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Shared brand footer: zinc-700 bar with small logo + „leseno“ (Marketing + Frage).
 */
async function drawBrandFooter(
  ctx: SKRSContext2D,
  font: OtFont,
  size: number,
  footerY: number,
  footerH: number,
): Promise<void> {
  ctx.fillStyle = FOOTER_ZINC;
  ctx.fillRect(0, footerY, size, footerH);

  const brandFontSize = Math.round(size * 0.032);
  const brandLabel = "leseno";
  const logoSize = Math.round(footerH * 0.55);
  let logo: Image | null = null;
  try {
    logo = await loadImage(
      readFileSync(/*turbopackIgnore: true*/ LESENO_LOGO_PATH),
    );
  } catch {
    logo = null;
  }

  const gap = Math.round(size * 0.012);
  const labelW = measureLineWidth(font, brandLabel, brandFontSize);
  const clusterW = (logo ? logoSize + gap : 0) + labelW;
  let cursorX = (size - clusterW) / 2;
  const midY = footerY + footerH / 2;

  if (logo) {
    ctx.drawImage(logo, cursorX, midY - logoSize / 2, logoSize, logoSize);
    cursorX += logoSize + gap;
  }

  ctx.fillStyle = "#fafafa";
  const scale = brandFontSize / font.unitsPerEm;
  let x = cursorX;
  const baselineY = midY + brandFontSize * 0.35;
  for (const ch of brandLabel) {
    const glyph = font.charToGlyph(ch);
    const otPath = glyph.getPath(x, baselineY, brandFontSize);
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
 * Draws the source image cover-cropped into a square canvas (fills every pixel).
 */
function drawCoverSquare(ctx: SKRSContext2D, image: Image, size: number): void {
  const scale = Math.max(size / image.width, size / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}
async function overlayWinkelStyle(input: {
  imageDataUrl: string;
  overlayText: string;
}): Promise<string> {
  const text = input.overlayText.trim().replace(/\s+/g, " ");
  if (!text) return input.imageDataUrl;

  const font = getNunitoFont();
  const { buffer } = parseDataUrl(input.imageDataUrl);
  const image = await loadImage(buffer);
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0, width, height);

  const bandH = Math.round(height * 0.3);
  const topLuma = meanBandLuminance(ctx, width, 0, bandH);
  const bottomLuma = meanBandLuminance(ctx, width, height - bandH, bandH);
  const placeTop = topLuma < bottomLuma - 4;

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

async function overlayMarketingStyle(input: {
  imageDataUrl: string;
  overlayText: string;
}): Promise<string> {
  const benefits = parseMarketingBenefitLines(input.overlayText);
  const font = getNunitoFont();
  const { buffer } = parseDataUrl(input.imageDataUrl);
  const image = await loadImage(buffer);
  const size = MARKETING_SOCIAL_IMAGE_PX;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Fill every pixel of the 1024² square (cover crop).
  drawCoverSquare(ctx, image, size);

  const footerH = Math.round(size * 0.078);
  const footerY = size - footerH;

  // Benefit card — stacked checklist (1–2 features), dark enough to read in feed.
  if (benefits.length > 0) {
    const padX = Math.round(size * 0.06);
    const cardMaxW = size - padX * 2;
    let fontSize = Math.round(size * 0.048);
    fontSize = Math.min(52, Math.max(30, fontSize));

    const textInnerPad = Math.round(size * 0.04);

    type BenefitRow = { label: string; lines: string[] };
    let rows: BenefitRow[] = [];
    let iconR = Math.round(fontSize * 0.42);
    let iconGap = Math.round(fontSize * 0.38);

    for (let attempt = 0; attempt < 10; attempt++) {
      iconR = Math.round(fontSize * 0.42);
      iconGap = Math.round(fontSize * 0.38);
      const textMaxW = cardMaxW - textInnerPad * 2 - iconR * 2 - iconGap;
      rows = benefits.map((label) => ({
        label,
        lines: wrapLines(font, label, fontSize, textMaxW),
      }));
      const maxLines = Math.max(...rows.map((row) => row.lines.length), 1);
      if (maxLines <= 2) break;
      fontSize = Math.max(26, fontSize - 2);
    }

    const lineHeight = Math.round(fontSize * 1.18);
    const rowGap = Math.round(fontSize * 0.42);
    const cardPadY = Math.round(fontSize * 0.58);
    let contentH = 0;
    for (let i = 0; i < rows.length; i++) {
      contentH += Math.max(iconR * 2, rows[i]!.lines.length * lineHeight);
      if (i < rows.length - 1) contentH += rowGap;
    }
    const cardH = contentH + cardPadY * 2;

    let widestText = 0;
    for (const row of rows) {
      for (const line of row.lines) {
        widestText = Math.max(
          widestText,
          measureLineWidth(font, line, fontSize),
        );
      }
    }
    const cardW = Math.min(
      cardMaxW,
      Math.max(
        Math.round(size * 0.55),
        textInnerPad * 2 + iconR * 2 + iconGap + widestText,
      ),
    );
    const cardX = (size - cardW) / 2;
    const cardY = Math.round(size * 0.07);

    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = Math.round(size * 0.018);
    ctx.shadowOffsetY = Math.round(size * 0.006);
    ctx.fillStyle = MARKETING_CARD_FILL;
    fillRoundedRect(ctx, cardX, cardY, cardW, cardH, Math.round(size * 0.02));
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    let rowTop = cardY + cardPadY;
    const textLeft = cardX + textInnerPad + iconR * 2 + iconGap;

    for (const row of rows) {
      const blockH = Math.max(iconR * 2, row.lines.length * lineHeight);
      const iconCy = rowTop + blockH / 2;
      drawCheckBadge(ctx, cardX + textInnerPad + iconR, iconCy, iconR);

      ctx.fillStyle = MARKETING_ORANGE;
      ctx.strokeStyle = MARKETING_ORANGE;
      const firstBaseline =
        rowTop +
        (blockH - row.lines.length * lineHeight) / 2 +
        fontSize * 0.82;
      for (let i = 0; i < row.lines.length; i++) {
        fillNunitoLineBoldLeft(
          ctx,
          font,
          row.lines[i]!,
          fontSize,
          textLeft,
          firstBaseline + i * lineHeight,
        );
      }
      rowTop += blockH + rowGap;
    }
  }

  // Brand footer bar.
  await drawBrandFooter(ctx, font, size, footerY, footerH);

  const out = canvas.toBuffer("image/jpeg", 88);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * Frage posts: fixed `public/bg3.jpg`, question in orange-800 bold,
 * centered above the brand footer (logo + leseno).
 */
async function overlayFrageStyle(input: {
  overlayText: string;
  /** Optional base — defaults to bg3.jpg when omitted. */
  imageDataUrl?: string;
}): Promise<string> {
  const text = input.overlayText.trim().replace(/\s+/g, " ");
  if (!text) {
    throw new Error("Frage fehlt für das Overlay.");
  }

  const font = getNunitoFont();
  let image: Image;
  if (input.imageDataUrl?.startsWith("data:")) {
    const { buffer } = parseDataUrl(input.imageDataUrl);
    image = await loadImage(buffer);
  } else {
    try {
      image = await loadImage(
        readFileSync(/*turbopackIgnore: true*/ FRAGE_BG_PATH),
      );
    } catch (error) {
      throw new Error(
        `Frage-Hintergrund fehlt unter ${FRAGE_BG_PATH}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const size = MARKETING_SOCIAL_IMAGE_PX;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  drawCoverSquare(ctx, image, size);

  const footerH = Math.round(size * 0.078);
  const footerY = size - footerH;
  const contentH = footerY;

  const padX = Math.round(size * 0.08);
  const maxTextWidth = size - padX * 2;
  let fontSize = Math.round(size * 0.078); // ~80px at 1024
  fontSize = Math.min(FRAGE_TEXT_BASE_PX + 8, Math.max(56, fontSize));
  let lines = wrapLines(font, text, fontSize, maxTextWidth);
  // Prefer large type; shrink only if the question won't fit in 4 lines.
  for (let attempt = 0; attempt < 10 && lines.length > 4; attempt++) {
    fontSize = Math.max(48, fontSize - 4);
    lines = wrapLines(font, text, fontSize, maxTextWidth);
  }

  const lineHeight = Math.round(fontSize * 1.2);
  const blockHeight = lines.length * lineHeight;
  // Vertically center in the area above the footer.
  const firstBaseline =
    contentH / 2 - blockHeight / 2 + fontSize * 0.8;

  ctx.fillStyle = FRAGE_TEXT_COLOR;
  ctx.strokeStyle = FRAGE_TEXT_COLOR;
  for (let i = 0; i < lines.length; i++) {
    fillNunitoLineBold(
      ctx,
      font,
      lines[i]!,
      fontSize,
      size / 2,
      firstBaseline + i * lineHeight,
    );
  }

  await drawBrandFooter(ctx, font, size, footerY, footerH);

  const out = canvas.toBuffer("image/jpeg", 90);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * Draws `overlayText` exactly (no paraphrase).
 * `style: "marketing"` → checklist card; `style: "frage"` → bg3 + centered question.
 */
export async function overlayExactAngleTextOnImage(input: {
  imageDataUrl: string;
  overlayText: string;
  style?: "winkel" | "marketing" | "frage";
}): Promise<string> {
  if (input.style === "marketing") {
    return overlayMarketingStyle(input);
  }
  if (input.style === "frage") {
    return overlayFrageStyle({
      overlayText: input.overlayText,
      imageDataUrl: input.imageDataUrl,
    });
  }
  return overlayWinkelStyle(input);
}

/**
 * Composites the Frage question onto the fixed brand background (`public/bg3.jpg`).
 */
export async function composeFrageImage(question: string): Promise<string> {
  return overlayFrageStyle({ overlayText: question });
}
