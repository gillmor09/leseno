/**
 * Trade / marketing cover title overlay.
 * Brand UI font Nunito — ExtraBold primary, Bold for secondary/eyebrow (never lighter).
 * Series titles (`Clever erzählt: …`) keep the prefix quiet; the topic after `:` is the hero.
 * Spelling locked to the book title; thin dark-gray halo + soft drop shadow.
 */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { parse, type Font as OtFont } from "opentype.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");

/** Vendored Nunito statics (latin + latin-ext — DE umlauts). Min weight: Bold. */
const FONT_FILES = {
  primary: "Nunito-ExtraBold.ttf",
  secondary: "Nunito-Bold.ttf",
  eyebrow: "Nunito-Bold.ttf",
} as const;

type FontRole = keyof typeof FONT_FILES;

const fontCache: Partial<Record<FontRole, OtFont>> = {};

export type CoverTitleZone = "top" | "upper" | "center" | "lower" | "bottom";
export type CoverTitleAlign = "left" | "center" | "right";
export type CoverTitleSize = "compact" | "standard" | "hero";
export type CoverTitleTone = "light" | "dark" | "auto";
export type CoverTitleScrim = "none" | "soft" | "strong";
/** Typographic role — drives size, tracking, font, halo (trade hierarchy). */
export type CoverTitleRole = "eyebrow" | "primary" | "secondary";

export type CoverTitleLine = {
  text: string;
  role: CoverTitleRole;
};

export type CoverTitleDesign = {
  lines: CoverTitleLine[];
  zone: CoverTitleZone;
  align: CoverTitleAlign;
  size: CoverTitleSize;
  tone: CoverTitleTone;
  scrim: CoverTitleScrim;
  publisherNote?: string;
};

function readFontArrayBuffer(fontPath: string): ArrayBuffer {
  const nodeBuf = readFileSync(/*turbopackIgnore: true*/ fontPath);
  return nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  );
}

function getFont(role: FontRole): OtFont {
  const cached = fontCache[role];
  if (cached) return cached;
  const file = path.join(FONTS_DIR, FONT_FILES[role]);
  const parsed = parse(readFontArrayBuffer(file));
  fontCache[role] = parsed;
  return parsed;
}

function fontForRole(role: CoverTitleRole): OtFont {
  if (role === "eyebrow") return getFont("eyebrow");
  if (role === "secondary") return getFont("secondary");
  return getFont("primary");
}

function parseDataUrl(dataUrl: string): { buffer: Buffer } {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültiges Cover-Bild (data URL).");
  return { buffer: Buffer.from(m[1], "base64") };
}

function measureLineWidth(
  font: OtFont,
  text: string,
  fontSize: number,
  tracking: number,
): number {
  const scale = fontSize / font.unitsPerEm;
  const chars = [...text];
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    width += (font.charToGlyph(chars[i]!).advanceWidth ?? 0) * scale;
    if (i < chars.length - 1) width += tracking;
  }
  return width;
}

function wrapLines(
  font: OtFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  tracking: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${current} ${word}`;
    if (measureLineWidth(font, candidate, fontSize, tracking) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function meanBandLuminance(
  ctx: SKRSContext2D,
  width: number,
  y0: number,
  bandH: number,
): number {
  const y = Math.max(0, Math.floor(y0));
  const h = Math.max(1, Math.min(bandH, ctx.canvas.height - y));
  const data = ctx.getImageData(0, y, width, h).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 16) {
    sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    n += 1;
  }
  return n > 0 ? sum / n : 128;
}

function baseSizePx(size: CoverTitleSize, width: number): number {
  // Thumbnail-readable on 1200×1920: ExtraBold primary needs real shelf presence.
  const ratio =
    size === "compact" ? 0.12 : size === "hero" ? 0.2 : 0.155;
  return Math.min(248, Math.max(108, Math.round(width * ratio)));
}

/** Never allow unreadably small type after width fitting. */
function minPrimaryPx(width: number): number {
  return Math.max(96, Math.round(width * 0.11));
}

/**
 * Short topic titles (few words/chars) grow ExtraBold until nearly full cover width.
 * Long titles keep the default hero base (shrink/wrap handles overflow later).
 */
function boostBaseForShortPrimary(
  base: number,
  specs: Array<{ text: string; role: CoverTitleRole }>,
  width: number,
  maxTextWidth: number,
): number {
  const primaryText = specs
    .filter((s) => s.role === "primary")
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");
  if (!primaryText) return base;

  const words = primaryText.split(/\s+/).filter(Boolean).length;
  const chars = primaryText.replace(/\s+/g, "").length;
  // Only boost compact titles — long lines wrap/shrink instead.
  if (words > 5 && chars > 28) return base;

  const font = getFont("primary");
  const maxBoost = Math.min(Math.round(width * 0.3), 300);
  let boosted = base;
  const target = maxTextWidth * (words <= 2 || chars <= 12 ? 0.96 : 0.9);

  while (boosted < maxBoost) {
    const m = roleMetrics("primary", boosted + 4);
    const w = measureLineWidth(
      font,
      primaryText,
      m.fontSize,
      m.fontSize * m.trackingFactor,
    );
    if (w >= target) break;
    boosted += 4;
  }
  return Math.max(base, boosted);
}

function roleMetrics(role: CoverTitleRole, base: number) {
  if (role === "eyebrow") {
    // Quiet series / lead-in — Bold, but never competes with ExtraBold primary.
    return {
      fontSize: Math.max(32, Math.round(base * 0.28)),
      trackingFactor: 0.12,
      lineHeightFactor: 1.2,
      gapAfter: 0.55,
    };
  }
  if (role === "secondary") {
    // Paired topic lines stay close in weight (Wald / & Bäume), not a footnote.
    return {
      fontSize: Math.max(72, Math.round(base * 0.9)),
      trackingFactor: -0.02,
      lineHeightFactor: 0.95,
      gapAfter: 0.06,
    };
  }
  // primary — Nunito ExtraBold shelf punch
  return {
    fontSize: base,
    trackingFactor: -0.025,
    lineHeightFactor: 0.9,
    gapAfter: 0.08,
  };
}

function zoneBand(
  zone: CoverTitleZone,
  height: number,
): { y0: number; bandH: number; anchor: "top" | "center" | "bottom" } {
  switch (zone) {
    case "top":
      return { y0: 0, bandH: Math.round(height * 0.34), anchor: "top" };
    case "upper":
      // Horizontally centered title in the upper third, just below Clever series badge.
      return {
        y0: Math.round(height * 0.14),
        bandH: Math.round(height * 0.18),
        anchor: "center",
      };
    case "center":
      return {
        y0: Math.round(height * 0.28),
        bandH: Math.round(height * 0.44),
        anchor: "center",
      };
    case "lower":
      return {
        y0: Math.round(height * 0.46),
        bandH: Math.round(height * 0.42),
        anchor: "bottom",
      };
    case "bottom":
    default:
      return {
        y0: Math.round(height * 0.5),
        bandH: Math.round(height * 0.5),
        anchor: "bottom",
      };
  }
}

/**
 * Mid-tone art: pick light type. Never force a full-bleed dim layer.
 */
export function enforceCoverContrast(
  design: CoverTitleDesign,
  luma: number,
): CoverTitleDesign {
  const mid = luma >= 85 && luma <= 170;
  const preferLight =
    design.tone === "light"
      ? true
      : design.tone === "dark"
        ? false
        : luma < 128;

  let tone: CoverTitleTone = preferLight ? "light" : "dark";
  // Scrim is opt-in and never used as a header bar (see drawScrim).
  let scrim = design.scrim;

  if (mid) {
    tone = "light";
    // Prefer no band; halo handles mid-tone contrast.
    if (scrim === "strong") scrim = "none";
  }

  // Top/upper titles must never get a dim strip — it reads as a UI chrome bar.
  if (design.zone === "top" || design.zone === "upper") {
    scrim = "none";
  }

  return { ...design, tone, scrim };
}

/**
 * Force shelf-readable scale — planner compact/standard is upgraded to hero.
 */
export function enforceCoverReadSize(
  design: CoverTitleDesign,
): CoverTitleDesign {
  return { ...design, size: "hero" };
}

/**
 * Optional bottom fade only. Top/center: never paint a full-width layer.
 */
function drawScrim(
  ctx: SKRSContext2D,
  width: number,
  y0: number,
  bandH: number,
  scrim: CoverTitleScrim,
  anchor: "top" | "center" | "bottom",
  lightType: boolean,
) {
  if (scrim === "none") return;
  // Header/center bands look like a wrong layer — skip entirely.
  if (anchor !== "bottom") return;

  const strong = scrim === "strong";
  const a0 = strong ? 0.36 : 0.18;
  const a1 = strong ? 0.16 : 0.07;
  const rgb = lightType ? "6,3,14" : "250,246,238";

  // Only the lowest ~22% of the title band, not half the cover.
  const fadeH = Math.max(24, Math.round(bandH * 0.45));
  const fadeY0 = y0 + bandH - fadeH;
  const g = ctx.createLinearGradient(0, fadeY0, 0, fadeY0 + fadeH);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.55, `rgba(${rgb},${a1})`);
  g.addColorStop(1, `rgba(${rgb},${a0})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, fadeY0, width, fadeH);
}

function resolveColors(tone: CoverTitleTone): {
  fill: string;
  halo: string;
  shadow: string;
  lightType: boolean;
} {
  const lightType = tone !== "dark";
  if (lightType) {
    return {
      fill: "#FFFFFF",
      // Thin dark-gray halo (not black outline).
      halo: "rgba(55, 58, 64, 0.72)",
      shadow: "rgba(55, 58, 64, 0.35)",
      lightType: true,
    };
  }
  return {
    fill: "#0E1018",
    halo: "rgba(55, 58, 64, 0.55)",
    shadow: "rgba(50, 52, 58, 0.28)",
    lightType: false,
  };
}

function asRole(v: unknown, fallback: CoverTitleRole): CoverTitleRole {
  const s = String(v ?? "").toLowerCase();
  if (s === "eyebrow" || s === "primary" || s === "secondary") return s;
  return fallback;
}

function fillLine(
  ctx: SKRSContext2D,
  font: OtFont,
  text: string,
  fontSize: number,
  tracking: number,
  align: CoverTitleAlign,
  padX: number,
  width: number,
  baselineY: number,
  fillColor: string,
  haloColor: string,
  shadowColor: string,
  isPrimary: boolean,
) {
  const lineW = measureLineWidth(font, text, fontSize, tracking);
  let x =
    align === "left"
      ? padX
      : align === "right"
        ? width - padX - lineW
        : (width - lineW) / 2;
  const scale = fontSize / font.unitsPerEm;
  // Thin halo — ~half the old 0.06 stroke (~2–3% of font size).
  const haloW = Math.max(1.2, fontSize * (isPrimary ? 0.028 : 0.022));

  const paintGlyphs = (mode: "shadow" | "halo" | "fill") => {
    ctx.save();
    if (mode === "shadow") {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = Math.max(2, fontSize * (isPrimary ? 0.07 : 0.055));
      ctx.shadowOffsetX = Math.max(1, Math.round(fontSize * 0.015));
      ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.03));
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    let cx = x;
    for (const ch of text) {
      const glyph = font.charToGlyph(ch);
      const otPath = glyph.getPath(cx, baselineY, fontSize);
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
      ctx.lineCap = "round";
      if (mode === "halo") {
        ctx.lineWidth = haloW;
        ctx.strokeStyle = haloColor;
        ctx.stroke();
      } else {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      cx += (glyph.advanceWidth ?? 0) * scale + tracking;
    }
    ctx.restore();
  };

  // Soft gray shadow → thin dark-gray halo → fill.
  paintGlyphs("shadow");
  paintGlyphs("halo");
  paintGlyphs("fill");
}

/**
 * Keep Mistral line breaks; force exact book-title spelling/casing.
 */
export function enforceExactTitleLines(
  title: string,
  proposed: string[],
): string[] {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const joined = proposed
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  if (joined.toLocaleLowerCase("de") === clean.toLocaleLowerCase("de")) {
    const titleWords = clean.split(/\s+/);
    const out: string[] = [];
    let i = 0;
    for (const line of proposed.map((l) => l.trim()).filter(Boolean)) {
      const n = line.split(/\s+/).filter(Boolean).length;
      out.push(titleWords.slice(i, i + n).join(" "));
      i += n;
    }
    if (i === titleWords.length && out.every(Boolean)) return out;
  }
  return defaultLineBreaks(clean);
}

/** Split on first `:` → series prefix vs. topic (e.g. Clever erzählt / Wald & Bäume). */
export function splitSeriesTitle(title: string): {
  series: string | null;
  topic: string;
} {
  const clean = title.trim().replace(/\s+/g, " ");
  const m = /^(.+?):\s+(.+)$/.exec(clean);
  if (!m?.[1] || !m[2]) return { series: null, topic: clean };
  const series = m[1].trim();
  const topic = m[2].trim();
  if (series.length < 3 || topic.length < 1) {
    return { series: null, topic: clean };
  }
  return { series, topic };
}

function isWeakTopicLead(text: string): boolean {
  const t = text.trim().toLocaleLowerCase("de");
  return (
    t === "&" ||
    t === "und" ||
    t === "and" ||
    t.startsWith("& ") ||
    t.startsWith("und ") ||
    t.startsWith("and ")
  );
}

function defaultLineBreaks(clean: string): string[] {
  const { series, topic } = splitSeriesTitle(clean);
  if (series) {
    const topicLines = breakTopicLines(topic);
    return [series.includes(":") ? series : `${series}:`, ...topicLines].map(
      (l) => l.trim(),
    );
  }
  const words = clean.split(/\s+/);
  if (words.length <= 2) return [clean];
  if (words.length === 3) {
    return [words[0]!, words.slice(1).join(" ")];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/** Topic after series colon: short topics stay one hero line; longer & pairs split. */
function breakTopicLines(topic: string): string[] {
  const clean = topic.trim().replace(/\s+/g, " ");
  const words = clean.split(/\s+/).filter(Boolean);
  // "Wald & Bäume" / short phrases → one dominant topic line (not Wald << & Bäume).
  if (words.length <= 4) return [clean];

  const andSplit = /^(.*?)\s+(&|und|and)\s+(.+)$/i.exec(clean);
  if (andSplit?.[1] && andSplit[2] && andSplit[3]) {
    const left = andSplit[1].trim();
    const conj = andSplit[2];
    const right = andSplit[3].trim();
    if (left.split(/\s+/).length <= 3 && right.split(/\s+/).length <= 3) {
      return [left, `${conj} ${right}`];
    }
  }
  if (words.length === 3) {
    return [words[0]!, words.slice(1).join(" ")];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/**
 * Series prefix = quiet eyebrow; first strong topic line = primary.
 * Never promote "& Bäume" over "Wald". Rebuilds from the exact title when `:` is present.
 */
export function enforceCoverTitleSemantics(
  title: string,
  lines: CoverTitleLine[],
): CoverTitleLine[] {
  if (lines.length === 0) return lines;

  const exact = title.trim().replace(/\s+/g, " ");
  const { series } = splitSeriesTitle(exact);

  if (series) {
    const colonIdx = exact.indexOf(":");
    const seriesLine = exact.slice(0, colonIdx + 1).trim();
    const topicPart = exact.slice(colonIdx + 1).trim();
    const topicLines = breakTopicLines(topicPart);
    const topicWords = topicPart.split(/\s+/);
    let wi = 0;
    const lockedTopic: string[] = [];
    for (const tl of topicLines) {
      const n = tl.split(/\s+/).filter(Boolean).length;
      lockedTopic.push(topicWords.slice(wi, wi + n).join(" "));
      wi += n;
    }
    const topics =
      wi === topicWords.length && lockedTopic.every(Boolean)
        ? lockedTopic
        : [topicPart];

    const firstStrong = topics.findIndex((t) => !isWeakTopicLead(t));
    const primaryAt = firstStrong >= 0 ? firstStrong : 0;
    return [
      { text: seriesLine, role: "eyebrow" as const },
      ...topics.map((text, i) => ({
        text,
        role:
          i === primaryAt
            ? ("primary" as const)
            : ("secondary" as const),
      })),
    ].slice(0, 4);
  }

  // No series colon: still avoid weak conjunction lines as the sole primary.
  const primaryIdx = lines.findIndex((l) => l.role === "primary");
  if (primaryIdx >= 0 && isWeakTopicLead(lines[primaryIdx]!.text)) {
    const better = lines.findIndex(
      (l, i) => i !== primaryIdx && !isWeakTopicLead(l.text),
    );
    if (better >= 0) {
      return lines.map((l, i) => ({
        ...l,
        role:
          i === better
            ? ("primary" as const)
            : l.role === "primary"
              ? ("secondary" as const)
              : l.role,
      }));
    }
  }
  return lines;
}

/**
 * Normalize planner lines → roles; always exactly one primary when possible.
 * Series titles get semantic repair after the planner.
 */
export function normalizeCoverTitleLines(
  title: string,
  rawLines: unknown,
): CoverTitleLine[] {
  const texts: string[] = [];
  const roles: CoverTitleRole[] = [];

  if (Array.isArray(rawLines)) {
    for (const item of rawLines.slice(0, 4)) {
      if (typeof item === "string") {
        const t = item.trim();
        if (t) {
          texts.push(t);
          roles.push("primary");
        }
        continue;
      }
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const t = String(row.text ?? "").trim();
        if (!t) continue;
        texts.push(t);
        roles.push(asRole(row.role, "primary"));
      }
    }
  }

  const exact = enforceExactTitleLines(title, texts);
  if (exact.length === 0) return [];

  const assigned: CoverTitleRole[] = exact.map((_, i) => roles[i] ?? "primary");
  let lines: CoverTitleLine[];
  if (exact.length === 1) {
    lines = [{ text: exact[0]!, role: "primary" }];
  } else if (assigned.filter((r) => r === "primary").length !== 1) {
    let primaryIdx = 0;
    let best = -1;
    for (let i = 0; i < exact.length; i++) {
      if (isWeakTopicLead(exact[i]!)) continue;
      const len = exact[i]!.length;
      if (len > best) {
        best = len;
        primaryIdx = i;
      }
    }
    lines = exact.map((text, i) => {
      if (i === primaryIdx) return { text, role: "primary" as const };
      if (i === 0 && primaryIdx !== 0 && text.split(/\s+/).length <= 3) {
        return { text, role: "eyebrow" as const };
      }
      return { text, role: "secondary" as const };
    });
  } else {
    lines = exact.map((text, i) => ({
      text,
      role: assigned[i] ?? "primary",
    }));
  }

  return enforceCoverTitleSemantics(title, lines);
}

export function defaultCoverTitleDesign(title: string): CoverTitleDesign {
  const clean = title.trim().replace(/\s+/g, " ");
  const { series, topic } = splitSeriesTitle(clean);
  let lines: CoverTitleLine[] = [];

  if (series) {
    const seriesLine = clean.slice(0, clean.indexOf(":") + 1).trim();
    const topicLines = breakTopicLines(topic);
    const topicWords = topic.split(/\s+/);
    let wi = 0;
    const locked: string[] = [];
    for (const tl of topicLines) {
      const n = tl.split(/\s+/).filter(Boolean).length;
      locked.push(topicWords.slice(wi, wi + n).join(" "));
      wi += n;
    }
    const topicLocked =
      wi === topicWords.length && locked.every(Boolean)
        ? locked
        : topicLines;
    const firstStrong = topicLocked.findIndex((t) => !isWeakTopicLead(t));
    lines = [
      { text: seriesLine, role: "eyebrow" as const },
      ...topicLocked.map((text, i): CoverTitleLine => ({
        text,
        role:
          i === (firstStrong >= 0 ? firstStrong : 0) ? "primary" : "secondary",
      })),
    ].slice(0, 4);
  } else {
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 4) {
      const mid = Math.ceil(words.length / 2);
      lines = [
        { text: words.slice(0, mid).join(" "), role: "primary" },
        { text: words.slice(mid).join(" "), role: "secondary" },
      ];
    } else if (words.length === 3) {
      lines = [
        { text: words[0]!, role: "eyebrow" },
        { text: words.slice(1).join(" "), role: "primary" },
      ];
    } else if (words.length === 2) {
      lines = [
        { text: words[0]!, role: "primary" },
        { text: words[1]!, role: "secondary" },
      ];
    } else if (clean) {
      lines = [{ text: clean, role: "primary" }];
    }
  }

  return {
    lines,
    zone: "lower",
    align: "center",
    size: "hero",
    tone: "auto",
    scrim: "none",
    publisherNote: "Fallback modern hierarchy; Nunito ExtraBold + Bold",
  };
}

/**
 * Composite exact title with marketing hierarchy and enforced contrast.
 */
export async function overlayCoverTitleByDesign(input: {
  imageDataUrl: string;
  design: CoverTitleDesign;
}): Promise<string> {
  const lines = input.design.lines
    .map((l) => ({
      text: String(l.text ?? "").trim(),
      role: asRole(l.role, "primary"),
    }))
    .filter((l) => l.text.length > 0)
    .slice(0, 4);
  if (lines.length === 0) return input.imageDataUrl;

  const { buffer } = parseDataUrl(input.imageDataUrl);
  const image = await loadImage(buffer);
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);

  const { y0, bandH, anchor } = zoneBand(input.design.zone, height);
  const luma = meanBandLuminance(ctx, width, y0, bandH);
  const design = enforceCoverReadSize(
    enforceCoverContrast(input.design, luma),
  );
  const colors = resolveColors(design.tone);

  drawScrim(ctx, width, y0, bandH, design.scrim, anchor, colors.lightType);

  const padX = Math.round(width * 0.055);
  const maxTextWidth = width - padX * 2;
  const floor = minPrimaryPx(width);
  let specs = lines.map((l) => ({ text: l.text, role: l.role }));
  let base = boostBaseForShortPrimary(
    baseSizePx(design.size, width),
    specs,
    width,
    maxTextWidth,
  );

  type Resolved = {
    text: string;
    role: CoverTitleRole;
    font: OtFont;
    fontSize: number;
    tracking: number;
    lineHeight: number;
    gapAfter: number;
  };

  const buildResolved = (specs: { text: string; role: CoverTitleRole }[]) =>
    specs.map((l) => {
      const m = roleMetrics(l.role, base);
      const font = fontForRole(l.role);
      return {
        text: l.text,
        role: l.role,
        font,
        fontSize: m.fontSize,
        tracking: m.fontSize * m.trackingFactor,
        lineHeight: Math.round(m.fontSize * m.lineHeightFactor),
        gapAfter: Math.round(m.fontSize * m.gapAfter),
      };
    });

  let resolved = buildResolved(specs);

  // Prefer wrapping long lines over shrinking — keeps thumbnail-readable scale.
  for (let guard = 0; guard < 8 && specs.length < 4; guard++) {
    const wideIdx = resolved.findIndex(
      (l) =>
        measureLineWidth(l.font, l.text, l.fontSize, l.tracking) >
        maxTextWidth,
    );
    if (wideIdx < 0) break;
    const wide = resolved[wideIdx]!;
    const wrapped = wrapLines(
      wide.font,
      wide.text,
      wide.fontSize,
      maxTextWidth,
      wide.tracking,
    );
    if (wrapped.length <= 1) break;

    const before = specs.slice(0, wideIdx);
    const after = specs.slice(wideIdx + 1);
    const pieces: { text: string; role: CoverTitleRole }[] = wrapped.map(
      (text, i) => {
        if (wide.role === "primary") {
          // Longest chunk keeps the punch; others become secondary.
          const longest = wrapped.reduce(
            (best, t, idx) => (t.length > wrapped[best]!.length ? idx : best),
            0,
          );
          if (i === longest) return { text, role: "primary" as const };
          if (i === 0 && longest !== 0 && text.split(/\s+/).length <= 2) {
            return { text, role: "eyebrow" as const };
          }
          return { text, role: "secondary" as const };
        }
        return { text, role: wide.role };
      },
    );
    specs = [...before, ...pieces, ...after].slice(0, 4);
    // Ensure exactly one primary when we split a primary line.
    if (wide.role === "primary") {
      const priCount = specs.filter((s) => s.role === "primary").length;
      if (priCount !== 1) {
        let bestI = 0;
        let bestLen = -1;
        for (let i = 0; i < specs.length; i++) {
          if (specs[i]!.text.length > bestLen) {
            bestLen = specs[i]!.text.length;
            bestI = i;
          }
        }
        specs = specs.map((s, i) => ({
          ...s,
          role:
            i === bestI
              ? ("primary" as const)
              : s.role === "primary"
                ? ("secondary" as const)
                : s.role,
        }));
      }
    }
    resolved = buildResolved(specs);
  }

  // Shrink only if a single token still overflows — never below readable floor.
  for (let attempt = 0; attempt < 24; attempt++) {
    const tooWide = resolved.some(
      (l) =>
        measureLineWidth(l.font, l.text, l.fontSize, l.tracking) >
        maxTextWidth,
    );
    if (!tooWide) break;
    if (base <= floor) break;
    base = Math.max(floor, base - 4);
    resolved = buildResolved(specs);
  }

  // Extra air before a much larger next line (eyebrow → Black display).
  for (let i = 0; i < resolved.length - 1; i++) {
    const cur = resolved[i]!;
    const next = resolved[i + 1]!;
    if (next.fontSize <= cur.fontSize * 1.15) continue;
    const minBaselineGap =
      next.fontSize * 0.84 + cur.fontSize * 0.22;
    const currentGap = cur.lineHeight + cur.gapAfter;
    if (currentGap < minBaselineGap) {
      cur.gapAfter += Math.ceil(minBaselineGap - currentGap);
    }
  }

  const stepHeights = resolved.map((l) => l.lineHeight + l.gapAfter);
  const blockHeight = stepHeights.reduce((s, h) => s + h, 0);
  const edge = Math.round(height * 0.045);
  let cursor: number;
  if (anchor === "top") {
    cursor = y0 + edge + resolved[0]!.fontSize * 0.88;
  } else if (anchor === "center") {
    cursor =
      y0 + bandH / 2 - blockHeight / 2 + resolved[0]!.fontSize * 0.82;
  } else {
    cursor =
      y0 + bandH - edge - blockHeight + resolved[0]!.fontSize * 0.86;
  }

  for (const line of resolved) {
    fillLine(
      ctx,
      line.font,
      line.text,
      line.fontSize,
      line.tracking,
      design.align,
      padX,
      width,
      cursor,
      colors.fill,
      colors.halo,
      colors.shadow,
      line.role === "primary",
    );
    cursor += line.lineHeight + line.gapAfter;
  }

  const out = canvas.toBuffer("image/jpeg", 82);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

export function stripTitleLeakFromScene(
  scene: string,
  title: string,
): string {
  let out = scene;
  const clean = title.trim().replace(/\s+/g, " ");
  if (clean.length >= 2) {
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), " ");
    for (const w of clean.split(/\s+/)) {
      if (w.length < 4) continue;
      const we = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\b${we}\\b`, "gi"), " ");
    }
  }
  out = out
    .replace(/\btitle\s*zone\s*:[^\n.]*[.\n]?/gi, "calm area for later type. ")
    .replace(/\bwith the (book )?title\b[^\n.]*/gi, "")
    .replace(/\blettering\b/gi, "shape")
    .replace(/\btypography\b/gi, "composition")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}
