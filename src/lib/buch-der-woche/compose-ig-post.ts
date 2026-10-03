/**
 * Instagram 1024² creative for Buch der Woche:
 * KI atmosphere (no text/book) → real cover as 3D book → Nunito type overlay.
 * Caption invites free Probelesen and uses the brand slogan.
 */

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateImage } from "@/lib/ai/generate-image";
import { generateText } from "@/lib/ai/provider";
import { BUCH_DER_WOCHE_SLOGAN } from "@/lib/buch-der-woche/catalog";
import {
  resolveSocialImagesModel,
  resolveSocialTextModel,
} from "@/lib/social/generate";

const SIZE = 1024;

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const BADGE_PATH = path.join(
  process.cwd(),
  "public",
  "clever_erzählt_300.png",
);

let fontsRegistered = false;

function ensureNunitoFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(
    path.join(FONTS_DIR, "Nunito-ExtraBold.ttf"),
    "Nunito ExtraBold",
  );
  GlobalFonts.registerFromPath(
    path.join(FONTS_DIR, "Nunito-Bold.ttf"),
    "Nunito Bold",
  );
  GlobalFonts.registerFromPath(
    path.join(FONTS_DIR, "Nunito-SemiBold.ttf"),
    "Nunito SemiBold",
  );
  fontsRegistered = true;
}

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return Buffer.from(m[1], "base64");
}

/**
 * Split teaser lead into three short lines that stay left of the book.
 * Prefers a dedicated line for „über“ when present.
 */
export function splitIgLeadLines(teaserLead: string): [string, string, string] {
  const raw = teaserLead.trim().replace(/\s+/g, " ");
  if (!raw) {
    return ["Ein Dutzend Kurzgeschichten", "über", "Lernen & Motivation."];
  }

  const uberMatch = raw.match(/^(.*?)\s+über\s+(.+)$/i);
  if (uberMatch) {
    const before = uberMatch[1]!.trim();
    const after = uberMatch[2]!.trim();
    return [before || "Ein Dutzend Kurzgeschichten", "über", after];
  }

  const words = raw.split(" ");
  if (words.length <= 4) {
    return [raw, "", ""];
  }
  const third = Math.ceil(words.length / 3);
  return [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];
}

const SCENE_PROMPT = [
  "Square 1:1 photorealistic Instagram product background, 1024px feel.",
  "Dark warm cinematic studio: charcoal to deep brown gradient, soft amber glow on the RIGHT half,",
  "dark wooden table surface visible in the lower third with natural grain,",
  "LEFT third mostly empty dark space with soft bokeh for later typography,",
  "NO book, NO hardcover, NO people, NO logos, NO text, NO letters, NO watermarks, NO UI.",
  "Premium kids-education brand atmosphere, high contrast, scroll-stopping.",
].join(" ");

/**
 * Compose the fixed Buch-der-Woche IG layout onto an atmosphere plate.
 */
export async function composeBuchDerWocheIgImage(input: {
  coverImageDataUrl: string;
  teaserLead: string;
}): Promise<string> {
  const cover = input.coverImageDataUrl.trim();
  if (!cover.startsWith("data:image/")) {
    throw new Error("Cover fehlt — bitte zuerst im Clever-erzählt-Admin erzeugen.");
  }

  ensureNunitoFonts();

  const imagesModel = await resolveSocialImagesModel();
  const scene = await generateImage({
    model: imagesModel,
    prompt: SCENE_PROMPT,
    sizePx: 1024,
    aspectRatio: "1:1",
    outputFormat: "png",
  });

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const baseImg = await loadImage(Buffer.from(parseDataUrl(scene.dataUrl)));
  ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);

  const scrim = ctx.createLinearGradient(0, 0, 480, 0);
  scrim.addColorStop(0, "rgba(12, 10, 9, 0.55)");
  scrim.addColorStop(0.75, "rgba(12, 10, 9, 0.22)");
  scrim.addColorStop(1, "rgba(12, 10, 9, 0)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, 520, SIZE);

  const coverImg = await loadImage(parseDataUrl(cover));
  const bookW = 455;
  const bookH = Math.round(bookW * (coverImg.height / coverImg.width));
  const bookX = 500;
  const bookY = 155;
  const spineW = 32;

  ctx.save();
  ctx.translate(bookX + bookW / 2, bookY + bookH / 2);
  ctx.rotate((-5.5 * Math.PI) / 180);
  ctx.translate(-(bookX + bookW / 2), -(bookY + bookH / 2));

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(
    bookX + bookW / 2 + 22,
    bookY + bookH + 22,
    bookW * 0.46,
    34,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const spineGrad = ctx.createLinearGradient(bookX - spineW, 0, bookX, 0);
  spineGrad.addColorStop(0, "#78716c");
  spineGrad.addColorStop(0.45, "#d6d3d1");
  spineGrad.addColorStop(1, "#57534e");
  ctx.fillStyle = spineGrad;
  ctx.fillRect(bookX - spineW, bookY + 8, spineW, bookH - 12);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bookX, bookY, bookW, bookH, 7);
  ctx.clip();
  ctx.drawImage(coverImg, bookX, bookY, bookW, bookH);
  ctx.restore();

  const sheen = ctx.createLinearGradient(
    bookX,
    bookY,
    bookX + bookW,
    bookY + bookH,
  );
  sheen.addColorStop(0, "rgba(255,255,255,0.14)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.roundRect(bookX, bookY, bookW, bookH, 7);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bookX, bookY, bookW, bookH, 7);
  ctx.stroke();
  ctx.restore();

  const badgeBuf = readFileSync(/*turbopackIgnore: true*/ BADGE_PATH);
  const badge = await loadImage(badgeBuf);
  const badgeH = 58;
  const badgeW = Math.round(badgeH * (300 / 180));
  ctx.drawImage(badge, 52, 48, badgeW, badgeH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = '700 28px "Nunito Bold"';
  ctx.textAlign = "right";
  ctx.fillText("leseno", SIZE - 52, 82);

  ctx.textAlign = "left";
  ctx.fillStyle = "#fbbf24";
  ctx.font = '800 22px "Nunito ExtraBold"';
  ctx.fillText("BUCH DER WOCHE", 52, 220);

  const [line1, line2, line3] = splitIgLeadLines(input.teaserLead);
  ctx.fillStyle = "rgba(255, 237, 213, 0.95)";
  ctx.font = '600 28px "Nunito SemiBold"';
  let y = 280;
  for (const line of [line1, line2, line3]) {
    if (!line) continue;
    ctx.fillText(line, 52, y);
    y += 38;
  }

  ctx.fillStyle = "#fbbf24";
  ctx.font = '800 34px "Nunito ExtraBold"';
  ctx.fillText(BUCH_DER_WOCHE_SLOGAN, 52, SIZE - 56);

  const png = canvas.toBuffer("image/png");
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Short Instagram caption: free Probelesen + growing series + slogan.
 */
export async function generateBuchDerWocheIgCaption(input: {
  title: string;
  teaserLead: string;
  chapterCount: number;
}): Promise<string> {
  const model = await resolveSocialTextModel();
  const text = await generateText({
    model,
    systemInstruction: `Du schreibst prägnante Instagram-Captions auf Deutsch für die Kindermarketing-Marke leseno (Serie Clever erzählt).
Ton: warm, einladend, klar — ohne Floskeln, ohne Emoji-Spam (max. 2 Emojis).
Pflichtinhalte:
1) Markenslogan exakt: „${BUCH_DER_WOCHE_SLOGAN}“
2) Einladung zum kostenlosen Probelesen / Online-Testen
3) Clever-erzählt-Buchserie wird ständig erweitert
4) Call-to-action auf Link in Bio / unten
Optional 3–6 passende Hashtags am Ende.
Keine Anführungszeichen um die gesamte Caption. Kein Markdown.`,
    userText: `Buch der Woche: ${input.title}
Teaser: ${input.teaserLead}
Kapitel/Kurzgeschichten: ${input.chapterCount}

Schreibe eine griffige Caption.`,
  });
  const caption = text.trim().replace(/^["'«»]+|["'«»]+$/g, "").trim();
  if (!caption) {
    throw new Error("Textmodell hat keine Caption geliefert.");
  }
  return caption;
}

/** Full IG package: image data URL + caption. */
export async function generateBuchDerWocheIgPost(input: {
  title: string;
  teaserLead: string;
  chapterCount: number;
  coverImageDataUrl: string;
}): Promise<{ imageDataUrl: string; caption: string }> {
  const [imageDataUrl, caption] = await Promise.all([
    composeBuchDerWocheIgImage({
      coverImageDataUrl: input.coverImageDataUrl,
      teaserLead: input.teaserLead,
    }),
    generateBuchDerWocheIgCaption({
      title: input.title,
      teaserLead: input.teaserLead,
      chapterCount: input.chapterCount,
    }),
  ]);
  return { imageDataUrl, caption };
}
