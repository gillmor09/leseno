/**
 * Parse “Stelle: …” quotes from lektor feedback and build highlight ranges
 * for the manual scene editor.
 */

export type HighlightPart = {
  text: string;
  marked: boolean;
};

/** True when the scene was let through via soft-pass (no active edit brief). */
export function feedbackIsSoftPass(feedback: string[]): boolean {
  return feedback.some((line) => /Soft-Pass nach/i.test(line));
}

/** True when the scene was last scored via HITL „Speichern & Score messen“. */
export function feedbackIsManualRescore(feedback: string[]): boolean {
  return feedback.some((line) => /Manuell gespeichert & neu bewertet/i.test(line));
}

/** Soft invention absorb — keep text, fold into state on commit; not a rewrite target. */
export function isStateAbsorbFeedback(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/Soft-Pass|Manuell gespeichert|Manuell:|Zwangsfreigabe|Manuelle /i.test(t)) {
    return false;
  }
  return /^\[STATE\]/i.test(t) || /→\s*State:/i.test(t);
}

/** Meta lines from HITL / soft-pass / tic scrub, not lektor craft issues. */
export function isFeedbackMetaLine(line: string): boolean {
  return /Soft-Pass nach|Manuell gespeichert|Manuell: Neu erzeugen|Zwangsfreigabe|Manuelle Freigabe|Manuelle Zwangsfreigabe|Formel-Tic-Scrub erledigt/i.test(
    line.trim(),
  );
}

/** True after the pre-commit Formel-Tic scrub hop ran for this scene. */
export function feedbackHasFormelTicScrub(feedback: string[]): boolean {
  return feedback.some((line) => /Formel-Tic-Scrub erledigt/i.test(line));
}

/**
 * Split lektor feedback: hard issues to fix vs soft inventions for state absorb.
 */
export function splitFeedbackForUi(feedback: string[]): {
  toFix: string[];
  stateAbsorb: string[];
} {
  const toFix: string[] = [];
  const stateAbsorb: string[] = [];
  for (const line of feedback) {
    const t = line.trim();
    if (!t || isFeedbackMetaLine(t)) continue;
    if (isStateAbsorbFeedback(t)) stateAbsorb.push(t);
    else toFix.push(t);
  }
  return { toFix, stateAbsorb };
}

/**
 * Extract exact draft quotes from feedback lines (`Stelle: „…“`).
 * Soft-pass and [STATE] absorb lines stay unmarked — only text to fix is highlighted.
 */
export function extractFeedbackQuotes(feedback: string[]): string[] {
  if (feedbackIsSoftPass(feedback)) return [];
  const quotes: string[] = [];
  for (const line of feedback) {
    if (isFeedbackMetaLine(line) || isStateAbsorbFeedback(line)) continue;
    const m =
      line.match(/Stelle:\s*[„«"](.+?)[“»"]/u) ??
      line.match(/Stelle:\s*"([^"]{3,200})"/) ??
      line.match(/Stelle:\s*'([^']{3,200})'/);
    const q = m?.[1]?.trim();
    if (q && q !== "—" && q !== "-" && !/^\(Schluss\)/i.test(q)) {
      quotes.push(q);
    }
  }
  return quotes;
}

/**
 * Quotes for HITL Rohtext edit: Stelle-lines + any „…“ snippets in logic notes.
 * Deduped; longer quotes preferred when overlapping later in buildHighlightParts.
 */
export function extractEditMarkQuotes(input: {
  feedback?: string[] | null;
  logicNotes?: string | null;
}): string[] {
  const lines: string[] = [];
  if (input.feedback?.length) lines.push(...input.feedback);
  if (input.logicNotes?.trim()) {
    lines.push(
      ...input.logicNotes
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }
  const fromStelle = extractFeedbackQuotes(lines);
  const extras: string[] = [];
  for (const line of lines) {
    if (isFeedbackMetaLine(line) || isStateAbsorbFeedback(line)) continue;
    // Any German/ASCII quotes in the note (auditor sometimes omits "Stelle:")
    const re = /[„«"]([^„«»"\n]{8,160})[“»"]/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) != null) {
      const q = m[1]?.trim();
      if (q && !/^\(Schluss\)/i.test(q)) extras.push(q);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...fromStelle, ...extras]) {
    const key = q.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/**
 * Split prose into marked/unmarked parts for the first occurrence of each quote.
 * Longer quotes win when overlapping; order is document order.
 */
export function buildHighlightParts(
  text: string,
  quotes: string[],
): HighlightPart[] {
  if (!text || quotes.length === 0) {
    return text ? [{ text, marked: false }] : [];
  }

  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (const quote of quotes) {
    if (quote.length < 3) continue;
    const idx = text.indexOf(quote);
    if (idx < 0) {
      // Soft match: collapse whitespace
      const soft = findSoftQuoteIndex(text, quote);
      if (soft) ranges.push(soft);
      continue;
    }
    ranges.push({ start: idx, end: idx + quote.length });
  }

  if (ranges.length === 0) return [{ text, marked: false }];

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start >= last.end) {
      merged.push({ ...r });
    } else if (r.end > last.end) {
      last.end = r.end;
    }
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      parts.push({ text: text.slice(cursor, r.start), marked: false });
    }
    parts.push({ text: text.slice(r.start, r.end), marked: true });
    cursor = r.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), marked: false });
  }
  return parts;
}

function findSoftQuoteIndex(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const needle = norm(quote);
  if (needle.length < 3) return null;
  const hay = norm(text);
  const at = hay.indexOf(needle);
  if (at < 0) return null;
  // Map approx back by walking original with whitespace collapse — best-effort.
  let hi = 0;
  let ti = 0;
  let start = -1;
  let end = -1;
  while (ti < text.length && hi <= at + needle.length) {
    const ch = text[ti]!;
    if (/\s/.test(ch)) {
      if (hi < hay.length && hay[hi] === " ") {
        if (hi === at) start = ti;
        hi += 1;
      }
      while (ti < text.length && /\s/.test(text[ti]!)) ti += 1;
      continue;
    }
    if (hi === at) start = ti;
    if (hi === at + needle.length - 1) {
      end = ti + 1;
      break;
    }
    hi += 1;
    ti += 1;
  }
  if (start >= 0 && end > start) return { start, end };
  return null;
}
