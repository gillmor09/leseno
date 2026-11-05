/**
 * Client-safe Abbildung/Tabelle matching for Herstellung preview + export.
 * Keys align with Infografik briefs (`abb-1`, `tab-1`, …).
 */

import type { SachbuchKapitelInfografik } from "@/lib/sachbuch/types";

export type SachbuchFigure = SachbuchKapitelInfografik & {
  /** Stable id: abb-1, tab-9-1, tab-vdp-matrix, … */
  key: string;
};

/** Caption / label → figure key (null if none). */
export function sachbuchFigureKeyFromText(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;

  const abb = t.match(/\bAbbildung\s*(\d+(?:\.\d+)?)\b/i);
  if (abb?.[1]) return `abb-${abb[1].replace(/\./g, "-")}`;

  const tab = t.match(/\bTabelle\s*(\d+(?:\.\d+)?)\b/i);
  if (tab?.[1]) return `tab-${tab[1].replace(/\./g, "-")}`;

  if (/VDP-Übersetzungsmatrix/i.test(t) || /Tabelle:\s*Die\s+VDP/i.test(t)) {
    return "tab-vdp-matrix";
  }
  return null;
}

/** Infer key from stored title when `key` was not persisted. */
export function sachbuchFigureKeyFromTitle(title: string): string | null {
  return sachbuchFigureKeyFromText(title);
}

/** Normalize chapter Infografiken to keyed figures. */
export function sachbuchFiguresFromList(
  list: SachbuchKapitelInfografik[],
): SachbuchFigure[] {
  const out: SachbuchFigure[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item.dataUrl?.trim().startsWith("data:image/")) continue;
    const key =
      (typeof item.key === "string" && item.key.trim()) ||
      sachbuchFigureKeyFromTitle(item.title) ||
      `fig-${out.length + 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      title: item.title?.trim() || key,
      dataUrl: item.dataUrl.trim(),
      prompt: item.prompt ?? "",
    });
  }
  return out;
}

export function sachbuchFigureByKey(
  figures: SachbuchFigure[],
  key: string,
): SachbuchFigure | undefined {
  return figures.find((f) => f.key === key);
}

/**
 * Start of a manuscript figure caption (Abbildung / Tabelle / VDP-Matrix).
 * Captions often contain German thousands dots (`600.000`) and long titles —
 * never stop at the first `.`.
 */
const FIGURE_CAPTION_START_RE =
  /(?:Abbildung|Tabelle)\s*[\d.]+\s*[:：]|Tabelle:\s*Die\s+VDP-Übersetzungsmatrix/i;

function isFigureCaptionLead(text: string): boolean {
  return /^(?:Abbildung|Tabelle)\s*[\d.]+\s*[:：]|^Tabelle:\s*Die\s+VDP/i.test(
    text.trim(),
  );
}

/**
 * Split a prose paragraph that embeds a caption mid-flow into
 * before / caption / after (caption kept as its own unit).
 * Caption runs to the end of the paragraph once the label is found
 * (blank-line paras are the unit of work in preview/PDF/ePub).
 */
export function splitProseAroundFigureCaption(para: string): {
  before: string;
  caption: string | null;
  after: string;
  figureKey: string | null;
} {
  const trimmed = para.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return { before: "", caption: null, after: "", figureKey: null };
  }

  // Usual case: the whole paragraph is the caption line.
  if (isFigureCaptionLead(trimmed)) {
    const figureKey = sachbuchFigureKeyFromText(trimmed);
    if (figureKey) {
      return {
        before: "",
        caption: trimmed,
        after: "",
        figureKey,
      };
    }
  }

  const m = FIGURE_CAPTION_START_RE.exec(trimmed);
  if (!m || m.index == null) {
    return { before: para, caption: null, after: "", figureKey: null };
  }

  const before = trimmed.slice(0, m.index).trim();
  const caption = trimmed.slice(m.index).trim();
  const figureKey = sachbuchFigureKeyFromText(caption);
  if (!figureKey) {
    return { before: para, caption: null, after: "", figureKey: null };
  }
  return { before, caption, after: "", figureKey };
}

/**
 * Drop Abbildung/Tabelle caption paragraphs when a matching graphic exists.
 * Keeps before/after prose around a mid-paragraph caption.
 */
export function stripKnownFigureCaptions(
  text: string,
  hasFigure: (key: string) => boolean,
): string {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const parts = splitProseAroundFigureCaption(p);
    if (parts.figureKey && hasFigure(parts.figureKey)) {
      if (parts.before) out.push(parts.before);
      if (parts.after) out.push(parts.after);
      continue;
    }
    out.push(p);
  }
  return out.join("\n\n");
}

/** True when this figure should prefer a full PDF page (portrait Abbildungen). */
export function sachbuchFigurePrefersFullPage(figure: SachbuchFigure): boolean {
  return figure.key.startsWith("abb-");
}
