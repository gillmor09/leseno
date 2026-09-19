/**
 * Parse / guide chapter structure in Szenenplot + Manuskript text.
 * One Gemini/Claude pass per chapter; headings must stay unique.
 *
 * Szenenplot beat sheets nest scenes under each Kapitel (`### Szene N.M — …`).
 * Manuskript prose uses print-style headings (no `#`, blank line after,
 * three blank lines before the next Kapitel).
 */

export type PlotChapter = {
  number: number;
  title: string;
  /** Beat sheet / prose body under the chapter heading (no heading line). */
  body: string;
};

export type PlotScene = {
  /** Display id e.g. "1.2" or "2". */
  id: string;
  title: string;
};

/** Markdown (`## Kapitel`) or print-style (`Kapitel`) chapter headings. */
const CHAPTER_HEADING_RE =
  /^(?:#{1,3}\s*)?Kapitel\s+(\d+)\s*(?:[—–\-:]\s*|\s+)(.+?)\s*$/i;

/** Match a chapter heading line (any number) at the start of a string. */
const LEADING_CHAPTER_HEADING_RE =
  /^(?:#{1,3}\s*)?Kapitel\s+(\d+)\b[^\n]*(?:\n+|$)/i;

/** Scene heading inside a chapter body, e.g. `### Szene 1.2 — Nacht auf dem Dach`. */
const SCENE_HEADING_RE =
  /^#{2,4}\s*Szene\s+(\d+(?:\.\d+)?)\s*(?:[—–\-:]\s*|\s+)(.+?)\s*$/i;

/**
 * Suggested chapter count from Zielwortzahl.
 * Aimed high enough for full arcs — previously capped at 12 for mid-length books.
 */
export function suggestedChapterCount(zielWortzahl: number | null): number {
  if (zielWortzahl == null || zielWortzahl <= 0) return 10;
  if (zielWortzahl <= 4_000) return 6;
  if (zielWortzahl <= 12_000) return 10;
  if (zielWortzahl <= 28_000) return 14;
  if (zielWortzahl <= 55_000) return 18;
  return 22;
}

/**
 * Strip leading Kapitel heading lines (markdown or print-style).
 * Fixes duplicate headings when the model echoes the title and we prepend again.
 */
export function stripLeadingChapterHeadings(
  text: string,
  chapterNumber?: number,
): string {
  let body = text.replace(/\r\n/g, "\n").trim();
  for (let i = 0; i < 8; i += 1) {
    const match = body.match(LEADING_CHAPTER_HEADING_RE);
    if (!match) break;
    const num = Number(match[1]);
    if (chapterNumber != null && num !== chapterNumber) break;
    body = body.slice(match[0].length).trim();
  }
  return body;
}

/**
 * Split Szenenplot/Manuskript into Kapitel blocks.
 * Bodies are stored without a leading heading line.
 * Accepts `## Kapitel N — …` and print-style `Kapitel N — …`.
 */
export function parsePlotChapters(plot: string): PlotChapter[] {
  const lines = plot.replace(/\r\n/g, "\n").split("\n");
  const chapters: PlotChapter[] = [];
  let current: PlotChapter | null = null;

  for (const line of lines) {
    const match = line.match(CHAPTER_HEADING_RE);
    if (match) {
      if (current) chapters.push(current);
      current = {
        number: Number(match[1]),
        title: (match[2] ?? "").trim(),
        body: "",
      };
      continue;
    }
    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current) chapters.push(current);

  return chapters
    .map((c) => ({
      ...c,
      body: stripLeadingChapterHeadings(c.body.trim(), c.number),
    }))
    .filter((c) => c.body.length >= 20 || c.title.length >= 2)
    .sort((a, b) => a.number - b.number);
}

/**
 * Extract scene headings from a chapter beat-sheet body.
 */
export function parsePlotScenes(body: string): PlotScene[] {
  const scenes: PlotScene[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(SCENE_HEADING_RE);
    if (!match) continue;
    scenes.push({
      id: match[1].trim(),
      title: (match[2] ?? "").trim() || `Szene ${match[1]}`,
    });
  }
  return scenes;
}

/**
 * Strip redundant „Kapitel N“ / meta from a chapter short title.
 * Empty string → heading is just „Kapitel N“ (no „— Kapitel N“).
 */
export function sanitizeChapterTitle(
  title: string,
  chapterNumber: number,
): string {
  let t = title.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  if (
    /endete mit|gestrichen|gibt es nicht|Textblock nicht|linearen Schluss/i.test(
      t,
    )
  ) {
    return "";
  }
  t = t
    .replace(
      new RegExp(`^Kapitel\\s*${chapterNumber}\\s*[—–\\-:]\\s*`, "i"),
      "",
    )
    .trim();
  if (new RegExp(`^Kapitel\\s*${chapterNumber}\\s*$`, "i").test(t)) return "";
  if (/^Kapitel\s+\d+\s*$/i.test(t)) return "";
  return t;
}

/**
 * Markdown heading for Szenenplot (structure / beat sheet).
 */
export function formatChapterHeading(chapter: PlotChapter): string {
  const title = sanitizeChapterTitle(chapter.title, chapter.number);
  return title
    ? `## Kapitel ${chapter.number} — ${title}`
    : `## Kapitel ${chapter.number}`;
}

/**
 * Print-ready chapter heading for Manuskript prose (no `#`).
 */
export function formatManuskriptChapterHeading(chapter: PlotChapter): string {
  const title = sanitizeChapterTitle(chapter.title, chapter.number);
  return title
    ? `Kapitel ${chapter.number} — ${title}`
    : `Kapitel ${chapter.number}`;
}

/**
 * Build one Szenenplot chapter block with markdown heading.
 */
export function formatChapterBlock(chapter: PlotChapter): string {
  const body = stripLeadingChapterHeadings(chapter.body, chapter.number);
  return body
    ? `${formatChapterHeading(chapter)}\n${body}`
    : formatChapterHeading(chapter);
}

/**
 * Build one Manuskript chapter: heading, one blank line, then body.
 */
export function formatManuskriptChapterBlock(chapter: PlotChapter): string {
  const body = stripLeadingChapterHeadings(chapter.body, chapter.number).trim();
  const heading = formatManuskriptChapterHeading(chapter);
  return body ? `${heading}\n\n${body}` : heading;
}

/**
 * Re-serialize Szenenplot chapters with markdown headings.
 */
export function serializePlotChapters(chapters: PlotChapter[]): string {
  return chapters.map(formatChapterBlock).join("\n\n");
}

/**
 * Re-serialize Manuskript chapters for book print:
 * no `#`, blank line after heading, three blank lines before the next chapter.
 */
export function serializeManuskriptChapters(chapters: PlotChapter[]): string {
  return chapters.map(formatManuskriptChapterBlock).join("\n\n\n\n");
}

/**
 * Parse + re-serialize Kapitelgerüst so every chapter has one markdown heading
 * and a single Kernsatz line (folds legacy Plot-Funktion + Kern bullets).
 */
export function normalizePlotDocument(plot: string): string {
  const chapters = parsePlotChapters(plot);
  if (chapters.length < 1) return plot.trim();
  return serializePlotChapters(
    chapters.map((ch) => ({
      ...ch,
      body: collapseKapitelgeruestKernsatz(ch.body),
    })),
  );
}

/**
 * Fold „Plot-Funktion“ + „Kern“ bullets into one Kernsatz line.
 * Already-compact bodies (one paragraph / Kernsatz:) stay as-is.
 */
export function collapseKapitelgeruestKernsatz(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let plotFunktion = "";
  let kern = "";
  const other: string[] = [];

  for (const line of lines) {
    const bullet = line.replace(/^[-*•]\s*/, "").trim();
    const plotMatch = bullet.match(
      /^Plot[-\u2011\u2010]?Funktion\s*:\s*(.+)$/i,
    );
    if (plotMatch) {
      plotFunktion = plotMatch[1]!.trim();
      continue;
    }
    const kernMatch = bullet.match(
      /^(?:Kern(?:satz)?(?:\s+in\s+einem\s+Satz)?)\s*:\s*(.+)$/i,
    );
    if (kernMatch) {
      kern = kernMatch[1]!.trim();
      continue;
    }
    other.push(line);
  }

  if (kern || plotFunktion) {
    const parts = [kern, plotFunktion ? `(${plotFunktion})` : ""]
      .filter(Boolean)
      .join(" ");
    return parts ? `Kernsatz: ${parts}` : "";
  }

  if (other.length === 1 && !/^Kernsatz\s*:/i.test(other[0]!)) {
    return `Kernsatz: ${other[0]!.replace(/^[-*•]\s*/, "").trim()}`;
  }

  return text;
}

/**
 * Keep one chapter per number: longest real prose body + best short title.
 */
export function dedupePlotChapters(chapters: PlotChapter[]): PlotChapter[] {
  const map = new Map<number, PlotChapter>();
  for (const raw of chapters) {
    const title = sanitizeChapterTitle(raw.title, raw.number);
    const body = raw.body.trim();
    const next: PlotChapter = { number: raw.number, title, body };
    const prev = map.get(raw.number);
    if (!prev) {
      map.set(raw.number, next);
      continue;
    }
    const betterBody = body.length > prev.body.length ? body : prev.body;
    const betterTitle =
      (body.length >= prev.body.length ? title : prev.title) ||
      title ||
      prev.title;
    map.set(raw.number, {
      number: raw.number,
      title: betterTitle,
      body: betterBody,
    });
  }
  return [...map.values()].sort((a, b) => a.number - b.number);
}

/**
 * Ensure every required Szenenplot chapter exists in the Manuskript list.
 * Missing chapters keep the plot title and an empty body (visible gap).
 */
export function mergeManuskriptAgainstPlot(
  plotChapters: PlotChapter[],
  manuskriptChapters: PlotChapter[],
): PlotChapter[] {
  if (plotChapters.length < 1) {
    return dedupePlotChapters(manuskriptChapters);
  }
  const have = new Map(
    dedupePlotChapters(manuskriptChapters).map((c) => [c.number, c]),
  );
  return plotChapters
    .map((plot) => {
      const existing = have.get(plot.number);
      const title =
        sanitizeChapterTitle(existing?.title ?? "", plot.number) ||
        sanitizeChapterTitle(plot.title, plot.number);
      return {
        number: plot.number,
        title,
        body: scrubManuskriptChapterBody(existing?.body ?? ""),
      };
    })
    .sort((a, b) => a.number - b.number);
}

/**
 * Missing plot chapter numbers (Manuskript incomplete vs Szenenplot).
 */
export function missingManuskriptChapterNumbers(
  plot: string,
  manuskript: string,
): number[] {
  const required = parsePlotChapters(plot).map((c) => c.number);
  if (required.length < 1) return [];
  const have = new Set(
    parsePlotChapters(manuskript)
      .filter((c) => scrubManuskriptChapterBody(c.body).length >= 40)
      .map((c) => c.number),
  );
  return required.filter((n) => !have.has(n));
}

/**
 * Parse + re-serialize Manuskript into print-ready chapter layout.
 * Scrubs meta stubs and dedupes numbers — never drops chapters silently.
 * Pass `requiredFromPlot` so every Szenenplot chapter stays present.
 */
export function normalizeManuskriptDocument(
  text: string,
  options?: { requiredFromPlot?: string },
): string {
  const chapters = parsePlotChapters(text);
  const scrubbed = dedupePlotChapters(
    chapters.map((c) => ({
      ...c,
      title: sanitizeChapterTitle(c.title, c.number),
      body: scrubManuskriptChapterBody(c.body),
    })),
  );
  const plot = options?.requiredFromPlot?.trim() ?? "";
  const required = plot ? parsePlotChapters(plot) : [];
  const merged =
    required.length > 0
      ? mergeManuskriptAgainstPlot(required, scrubbed)
      : scrubbed;
  if (merged.length < 1) return text.replace(/\r\n/g, "\n").trim();
  return serializeManuskriptChapters(merged);
}

/**
 * Required beat-sheet layout for Szenenplot chapter bodies (German prompt fragment).
 */
export function szenenplotBeatSheetFormHint(chapterNumber: number): string {
  return `Form (verbindlich — klare Kapitel-/Szenengliederung):
Pro Kapitel 2–5 Szenen. Jede Szene als eigene Überschrift:
### Szene ${chapterNumber}.1 — Kurztitel
- Ort: …
- Figuren: …
- Was passiert: (2–5 konkrete Stichpunkte, keine Floskeln)
- Emotion / Wendung: …
- Übergang: (was in die nächste Szene führt)

### Szene ${chapterNumber}.2 — Kurztitel
…

Am Kapitelende optional eine Zeile:
- Kapitel-Funktion: (Rolle im Gesamtbogen)

Regeln: Stichpunkte, keine Prosa, Szenen fortlaufend nummeriert (${chapterNumber}.1, ${chapterNumber}.2, …). Keine austauschbaren Füller.
Jedes Kapitel ist verbindlich 1:1 für das spätere Manuskript — keines als optional, zusammenlegbar, „Schluss bereits woanders“ oder „entfällt“ markieren.
VERBOTEN im Beat-Sheet: Meta wie „endet mit …“, „geht in Kapitel X auf“, „Textblock entfällt“.`;
}

/** Prompt hint: Manuskript chapter headings for book print. */
export const MANUSKRIPT_HEADING_FORM_HINT = `Kapitelüberschriften (Buchdruck, verbindlich):
- Form: „Kapitel N — Kurztitel“ (KEINE Rauten/Markdown wie ##).
- Nach der Überschrift genau eine Leerzeile, dann Fließtext.
- Vor jeder weiteren Kapitelüberschrift genau drei Leerzeilen.`;

/**
 * Hard rules so models never invent “chapter deleted / merged” stubs.
 * Szenenplot chapters must become real prose in the Manuskript.
 */
export const MANUSKRIPT_CHAPTER_PROSE_RULES = `Kapitel-Prosa (verbindlich — Szenenplot ist Gesetz):
- Jedes Kapitel aus dem Szenenplot MUSS als eigenständige erzählte Szene/Prosa existieren.
- VERBOTEN: Meta-Kommentare, Autor:innen-Notizen, Kursiv-Hinweise in Klammern an die Redaktion.
- VERBOTEN: Behaupten, ein Kapitel sei „gestrichen“, „gibt es nicht mehr“, „sei in anderen Kapiteln aufgegangen“, „nur noch Markierung“.
- VERBOTEN: Kapitel zusammenlegen, überspringen, umnummerieren oder weglassen.
- VERBOTEN: Über andere Kapitel sprechen statt die Handlung DIESES Kapitels zu erzählen.
- Schreibe nur erzählenden Fließtext (Handlung, Dialog, Wahrnehmung) für DIESES Kapitel.`;

/**
 * Detect editorial “chapter deleted/merged” stubs — not ordinary narrative
 * phrases like „gibt es … nicht mehr“ in dialogue or description.
 */
const META_CHAPTER_STUB_RES: RegExp[] = [
  /Dieses Kapitel\s+(?:wurde\s+)?gestrichen/i,
  /Dieses Kapitel gibt es(?:\s+als)?/i,
  /Kapitel\s+\d+\s*[—–\-]\s*endete mit/i,
  /Kapitel\s+\d+[^.!?\n]{0,50}(?:gibt es|existiert)[^.!?\n]{0,40}nicht mehr/i,
  /eigenst[aä]ndigen?\s+Textblock\s+nicht\s+mehr/i,
  /markieren im Manuskript nur noch/i,
  /Handlung endet linear/i,
  /erneute Fassung an dieser Stelle/i,
  /Geschlossenheit des Einzelbands/i,
  /in den linearen Schluss(?:\s+der\s+Kapitel)?/i,
  /ist in den linearen Schluss/i,
  /aufgegangen\.?\s*Die folgenden Zeilen markieren/i,
  /\*\(\s*Dieses Kapitel/i,
  /nur noch[, ]dass die Geschichte dort bereits vollständig/i,
  /als eigenst[aä]ndigen Textblock nicht/i,
];

function paragraphLooksLikeMetaStub(paragraph: string): boolean {
  const t = paragraph.replace(/\r\n/g, "\n").trim();
  if (!t) return false;
  return META_CHAPTER_STUB_RES.some((re) => re.test(t));
}

/**
 * True when the body looks like a meta “chapter deleted” stub instead of prose.
 */
export function isMetaManuskriptChapterStub(body: string): boolean {
  const t = body.replace(/\r\n/g, "\n").trim();
  if (!t) return true;
  if (META_CHAPTER_STUB_RES.some((re) => re.test(t))) return true;
  // Almost entirely one long editorial parenthesis / italic note.
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters < 120) return false;
  const parenChunks = t.match(/\([^)]{40,}\)/g) ?? [];
  const parenLetters = parenChunks.join("").replace(/[^\p{L}]/gu, "").length;
  if (parenChunks.length >= 1 && parenLetters / letters > 0.7) return true;
  return false;
}

/** Drop meta/stub paragraphs; empty result means the chapter must be rewritten. */
export function scrubManuskriptChapterBody(body: string): string {
  const parts = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !paragraphLooksLikeMetaStub(p) && !isMetaManuskriptChapterStub(p));
  return parts.join("\n\n").trim();
}

/**
 * Reject empty or meta stubs so Verbessern/Erzeugen cannot drop Szenenplot chapters.
 */
export function assertRealManuskriptProse(
  body: string,
  chapterNumber: number,
  title?: string,
): void {
  const t = scrubManuskriptChapterBody(body);
  const label = title?.trim()
    ? `Kapitel ${chapterNumber} („${title.trim()}“)`
    : `Kapitel ${chapterNumber}`;
  if (t.length < 80) {
    throw new Error(
      `${label}: zu wenig Prosa — jedes Szenenplot-Kapitel braucht erzählten Fließtext.`,
    );
  }
  if (isMetaManuskriptChapterStub(t)) {
    throw new Error(
      `${label}: Meta-/Streich-Text statt Prosa verboten. Das Kapitel muss als eigene Erzählung stehen (Szenenplot bleibt verbindlich).`,
    );
  }
}
