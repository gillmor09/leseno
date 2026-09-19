/**
 * Manuskript: Lektor briefs once; Co-Autor writes one Kapitel per call.
 * Continuity: Context Assembly + story_state extract between chapters
 * (`manuskript-continuity.ts`). Critique by Testleser; weave keeps headings.
 * Stored in `editorial.manuskriptText` (+ `editorial.storyState`).
 */

import {
  AI_FETCH_TIMEOUT_MAX_MS,
  AI_LONG_PROSE_TIMEOUT_MS,
  isAiAbortError,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  countWords,
  exposeTextFromEditorial,
  parseRomanLeserFeedback,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanLeserFeedback,
  type RomanStoryState,
} from "@/lib/roman/editorial";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  assembleManuskriptChapterContext,
  buildDeterministicChapterContextBuffer,
  CONTINUITY_PREV_TAIL_CHARS,
  extractManuskriptStoryState,
} from "@/lib/roman/manuskript-continuity";
import {
  chooseUnconventionalChapterBeat,
  formatPathBBlock,
  pickKeyChapterNumbers,
} from "@/lib/roman/manuskript-ab";
import {
  MANUSKRIPT_BOOK_WORD_FLOOR_PCT,
  MANUSKRIPT_CHAPTER_ACCEPT_FLOOR_PCT,
  formatManuskriptWordMetrics,
  manuskriptBookNearOrOverTarget,
  manuskriptChaptersUnderMin,
  manuskriptChapterWordCount,
  manuskriptNeedsPromptBlock,
  manuskriptWordsPerChapter,
} from "@/lib/roman/manuskript-contracts";
import { formatCharaktere, resolveFanPersona } from "@/lib/roman/fundament";
import {
  formatChapterHeading,
  formatManuskriptChapterBlock,
  formatManuskriptChapterHeading,
  MANUSKRIPT_CHAPTER_PROSE_RULES,
  MANUSKRIPT_HEADING_FORM_HINT,
  assertRealManuskriptProse,
  normalizeManuskriptDocument,
  parsePlotChapters,
  sanitizeChapterTitle,
  stripLeadingChapterHeadings,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  formatStructuredChapterForManuskript,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";

const MARK_START = "===MANUSKRIPT===";
const MARK_ENDE = "===ENDE===";

/**
 * Chapter prose: long wall-clock budget (OpenAI reasoning models are slow).
 * Absolute max from {@link AI_FETCH_TIMEOUT_MAX_MS}.
 */
const MANUSKRIPT_CHAPTER_TOKENS = 8_000;
const MANUSKRIPT_CHAPTER_TIMEOUT_MS = AI_FETCH_TIMEOUT_MAX_MS;
const MAX_CHAPTERS = 24;

export type ManuskriptBriefResult = {
  lektorBrief: string;
  lektorLabel: string;
  chapters: PlotChapter[];
  sharedContext: string;
  coAutorSystem: string;
  proseModelLabel: string;
  zielWortzahl: number | null;
  zielWortzahlSzeneMax: number | null;
  weave: boolean;
};

export type ManuskriptChapterWriteResult = {
  chapterMarkdown: string;
  chapterNumber: number;
  modelLabel: string;
};

export type ManuskriptSuggestResult = {
  manuskriptText: string;
  woven: boolean;
  modelLabel: string;
  lektorLabel: string;
  /** Final continuity memory after the last chapter. */
  storyState: RomanStoryState | null;
  /** Length / target metrics for toast + history. */
  wordMetrics: {
    words: number;
    zielWortzahl: number | null;
    chaptersUnderMin: number[];
    expandedChapters: number[];
  };
};

export type ManuskriptCritiqueResult = {
  critique: string;
  modelLabel: string;
};

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBetween(text: string, startMark: string, endMark: string): string {
  const a = text.indexOf(startMark);
  if (a < 0) return "";
  const from = a + startMark.length;
  const b = text.indexOf(endMark, from);
  return (b < 0 ? text.slice(from) : text.slice(from, b)).trim();
}

function parseManuskriptText(raw: string, roleLabel: string): string {
  const text = stripFence(raw);
  const marked = extractBetween(text, MARK_START, MARK_ENDE);
  const body = (marked || text.replace(MARK_START, "").replace(MARK_ENDE, ""))
    .trim()
    .slice(0, CLIP.manuskript);
  if (body.length < 400) {
    throw new Error(`${roleLabel} lieferte kein brauchbares Manuskript.`);
  }
  return body;
}

/** True when Manuskript already has substance. */
export function hasFilledManuskript(text: string): boolean {
  return text.trim().length >= 400;
}

function cleanChapterProse(raw: string, chapter: PlotChapter): string {
  const body = stripFence(raw)
    .replace(MARK_START, "")
    .replace(MARK_ENDE, "")
    .trim();
  // Drop any echoed chapter headings — we always re-attach from PlotChapter meta.
  return stripLeadingChapterHeadings(body, chapter.number);
}

/** Parse Szenenplot Kapitel or throw a clear German error. */
export function requirePlotChapters(plot: string): PlotChapter[] {
  const chapters = parsePlotChapters(plot).slice(0, MAX_CHAPTERS);
  if (chapters.length < 2) {
    throw new Error(
      "Kapitelgerüst ohne Kapitel. Bitte neu erzeugen — es braucht Überschriften „## Kapitel N — Titel“.",
    );
  }
  return chapters;
}

/**
 * Claude (Entwicklungslektor) writes one brief for the whole book;
 * returns chapter list + context for sequential Co-Autor chapter writes.
 */
export async function briefManuskriptFromLektor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenplot: string;
  existingManuskript: string;
}): Promise<ManuskriptBriefResult> {
  const plot = input.szenenplot.trim();
  if (plot.length < 120) {
    throw new Error("Zuerst ein Kapitelgerüst im Schritt Kapitelgerüst anlegen.");
  }
  const chapters = requirePlotChapters(plot);
  const weave = hasFilledManuskript(input.existingManuskript);
  const expose = exposeTextFromEditorial(input.editorial);
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";
  const zielWort =
    input.editorial.zielWortzahlRoman != null
      ? String(input.editorial.zielWortzahlRoman)
      : "?";
  const alter =
    input.editorial.zielAlterMin != null || input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin ?? "?"}-${input.editorial.zielAlterMax ?? "?"}`
      : "?";

  const chapterIndex = chapters
    .map((c) => `- ${formatChapterHeading(c)}`)
    .join("\n");

  const lektor = await resolveRomanKiRolle("entwicklungslektor");
  const lektorUser = `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Alter: ${alter} · Lesestufe: ${input.editorial.lesestufe || "—"}
Zielwortzahl: ${zielWort}
Kapitelzahl: ${chapters.length}

# Ideendokumentation (gekürzt)
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Kapitelübersicht (Kapitelgerüst)
${chapterIndex}

# Kapitelgerüst
${plot.slice(0, CLIP.szenenplot)}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}

# Bisheriges Manuskript
${weave ? input.existingManuskript.trim().slice(0, CLIP.manuskript) : "(leer — neu schreiben)"}

Auftrag als Entwicklungslektor:
Arbeitsbrief an den Co-Autor für die kapitelweise Manuskript-Prosa.
- Stimme, Tempo, Perspektive, Tabus für das ganze Buch
- Wie Kapitel ineinander greifen (Übergänge, Spannungsbögen, Logik-Kontinuität)
- Prioritäten / Risiken / Figurenbögen entlang der Kapitel
- Was über Genre-Mittelmaß hinausgehen muss (Eigenstimme, konkrete Bilder, keine KI-Floskeln)
${weave ? "- Was am bestehenden Manuskript behalten oder schärfen (Inhalt/Stil — KEINE Kapitel streichen)" : ""}
VERBOTEN im Brief: Kapitel aus dem Kapitelgerüst streichen, zusammenlegen, als „entfällt“ markieren oder durch Meta-Notizen ersetzen. Alle ${chapters.length} Kapitel bleiben.
Kein JSON — klarer Brief. Kein fertiger Romantext.`;

  const lektorDraft = (
    await generateText({
      model: lektor.model,
      systemInstruction: `${lektor.rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Manuskript-Brief:
Du bereitest die kapitelweise Prosa dramaturgisch vor. Arbeitsbrief für den Co-Autor.`,
      userText: lektorUser,
      maxTokens: 2_500,
      timeoutMs: 60_000,
    })
  ).trim();

  if (!lektorDraft || lektorDraft.length < 40) {
    throw new Error("Entwicklungslektor lieferte keinen brauchbaren Schreib-Brief.");
  }

  const co = await resolveRomanKiRolle("co_autor");

  const sharedContext = `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Alter / Lesestufe: ${alter} / ${input.editorial.lesestufe || "—"}
Zielwortzahl Buch: ${zielWort}
Kapitel: ${chapters.length}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

${formatAutorBiasFromCharaktere(input.charaktere)}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}`;

  return {
    lektorBrief: lektorDraft.slice(0, CLIP.lektorBrief),
    lektorLabel: lektor.model.label,
    chapters,
    sharedContext,
    coAutorSystem: `${co.rolle.systemPrompt}\n\n${ROMAN_EXCELLENCE_MANDATE}`,
    proseModelLabel: co.model.label,
    zielWortzahl: input.editorial.zielWortzahlRoman,
    zielWortzahlSzeneMax: input.editorial.zielWortzahlSzeneMax,
    weave,
  };
}

/**
 * Co-Autor writes a single chapter; caller appends and persists.
 * Optional `expandBody` = lengthen existing prose to hit min (keep plot).
 * Optional `continuityBuffer` = assembled Context Buffer (Memory light).
 */
export async function writeManuskriptChapter(input: {
  coAutorSystem: string;
  sharedContext: string;
  lektorBrief: string;
  chapter: PlotChapter;
  allChapters: PlotChapter[];
  previousChaptersMarkdown: string;
  existingManuskript: string;
  weave: boolean;
  zielWortzahl: number | null;
  /** Optional per-scene max from Basics — raises chapter ceiling. */
  zielWortzahlSzeneMax?: number | null;
  /** Market needs MUSS block for this chapter. */
  needsBlock?: string;
  /** Fixed character reaction / subtext bias. */
  autorBias?: string;
  /** Unconventional beat for key chapters (Pfad B). */
  pathBBlock?: string;
  /** Compact continuity + focus buffer (preferred over dumping full shared context). */
  continuityBuffer?: string;
  /** Structured Kapitelgerüst beats (preferred over markdown body). */
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** When set, expand this body instead of writing from scratch. */
  expandBody?: string;
}): Promise<ManuskriptChapterWriteResult & { wordCount: number }> {
  const { model } = await resolveRomanKiRolle("co_autor");
  const { min, max } = manuskriptWordsPerChapter(
    input.zielWortzahl,
    input.allChapters.length,
    input.zielWortzahlSzeneMax,
  );
  const chapter = input.chapter;
  const heading = formatManuskriptChapterHeading(chapter);
  const continuity = input.continuityBuffer?.trim() ?? "";
  const slimContext = continuity
    ? continuity.slice(0, 4_500)
    : input.sharedContext.slice(0, CLIP.sharedContext);
  const prev =
    input.previousChaptersMarkdown.trim().length > 80
      ? input.previousChaptersMarkdown
          .trim()
          .slice(-(continuity ? CONTINUITY_PREV_TAIL_CHARS : 16_000))
      : "(noch nichts geschrieben — dies ist Kapitel 1)";
  const remaining = input.allChapters
    .filter((c) => c.number > chapter.number)
    .slice(0, 5)
    .map((c) => `- ${formatManuskriptChapterHeading(c)}`)
    .join("\n");
  const needs = input.needsBlock?.trim()
    ? `\n${input.needsBlock.trim()}\n`
    : "";
  const bias = input.autorBias?.trim()
    ? `\n${input.autorBias.trim()}\n`
    : "";
  const pathB = input.pathBBlock?.trim()
    ? `\n${input.pathBBlock.trim()}\n`
    : "";
  const expand = Boolean(input.expandBody?.trim());
  const contextHeader = continuity
    ? `# Context-Buffer (Continuity + Fokus)
${slimContext}`
    : `# Shared Context
${slimContext}`;

  const userText = expand
    ? `${contextHeader}
${needs}${bias}
# Arbeitsbrief Entwicklungslektor
${input.lektorBrief.slice(0, CLIP.lektorBrief)}

# Kapitel ${chapter.number} — expandieren (Handlung behalten)
${formatChapterHeading(chapter)}

# Bisheriger Body (zu kurz — erweitern, nicht ersetzen durch Kurzfassung)
${input.expandBody!.trim().slice(0, CLIP.chapterBody)}

Auftrag — schreibe den VOLLSTÄNDIGEN neuen Body für DIESES Kapitel:
- HARTE Bandbreite: ${min}–${max} Wörter (zählbar). Unter ${min} unvollständig; über ${max} zu lang — streichen/verdichten.
- Behalte Plot, Figuren und Wendungen; erweitere mit Dialog, Sinneseindruck, Innenleben, klaren Beats.
- Autor-Bias und Figurenstimmen einhalten. Continuity-State nicht widersprechen.
- KEINE Kapitel-Überschrift.
${MANUSKRIPT_CHAPTER_PROSE_RULES}`
    : `${contextHeader}
${needs}${bias}${pathB}
# Arbeitsbrief Entwicklungslektor
${input.lektorBrief.slice(0, CLIP.lektorBrief)}

# Bereits geschriebene Kapitel — nur Übergang (Ende Vorgänger)
${prev}

# Dieses Kapitel (verbindlich aus dem Kapitelgerüst)
${formatChapterHeading(chapter)}
${
  formatStructuredChapterForManuskript(
    input.szenenplotStructured,
    chapter.number,
  ) || chapter.body.slice(0, CLIP.chapterBody)
}

# Noch folgende Kapitel (nur Orientierung, NICHT schreiben)
${remaining || "(keins — dies ist das letzte Kapitel)"}

Auftrag — schreibe NUR den Fließtext für dieses eine Kapitel:
- HARTE Bandbreite: ${min}–${max} Wörter (zählbar). Zielnähe wichtiger als Aufblasen.
- Unter ${min} unvollständig; über ${max} zu lang — lieber knapper und dichter.
- Continuity-State und harte Fakten einhalten — keine Drift.
- KEINE Kapitel-Überschrift — die setzt das System druckfertig („Kapitel N — Titel“ ohne Rauten).
- Figurenstimmen und Autor-Bias aus den Steckbriefen einhalten (Subtext, Default unter Druck).
${pathB ? "- Pfad-B-Beat umsetzen (nicht den konventionellen Genre-Default).\n" : ""}- Nahtlos anschließen; Kernsatz/Funktion des Kapitels umsetzen; vollständig zu Ende schreiben.
- Keine KI-Mittelmaß-Prosa: konkrete Bilder, klare Figurenstimmen, keine Logiklöcher oder Spannungshänger.

${MANUSKRIPT_HEADING_FORM_HINT}

${MANUSKRIPT_CHAPTER_PROSE_RULES}
Du schreibst Kapitel ${chapter.number} („${sanitizeChapterTitle(chapter.title, chapter.number) || heading}“) — erzähle DIESES Kapitel als Prosa (Kontext + Kernsatz), nicht über andere Kapitel.`;

  const raw = await generateText({
    model,
    systemInstruction: `${input.coAutorSystem}

Zusatzauftrag Manuskript-Kapitel ${chapter.number}${expand ? " (Expand)" : ""}:
Genau EIN Kapitel als Fließtext. Keine Kapitel-Überschrift (weder Markdown noch „Kapitel N — …“).
Kein ${MARK_START}/${MARK_ENDE}. Keine anderen Kapitel. Mindestens ${min} Wörter.
${MANUSKRIPT_CHAPTER_PROSE_RULES}`,
    userText,
    preferJson: false,
    maxTokens: MANUSKRIPT_CHAPTER_TOKENS,
    timeoutMs: MANUSKRIPT_CHAPTER_TIMEOUT_MS,
    reasoningEffort: "none",
  });

  const cleaned = cleanChapterProse(raw, chapter);
  assertRealManuskriptProse(cleaned, chapter.number, chapter.title);
  const wordCount = manuskriptChapterWordCount(cleaned);

  return {
    chapterMarkdown: formatManuskriptChapterBlock({ ...chapter, body: cleaned }),
    chapterNumber: chapter.number,
    modelLabel: model.label,
    wordCount,
  };
}

/**
 * Write chapter with hard length gate: up to 2 expand retries if under min.
 * Does not expand further when already at/over chapter max.
 * Exported for single-chapter Erzeugen.
 */
export async function writeManuskriptChapterWithLengthGate(input: {
  coAutorSystem: string;
  sharedContext: string;
  lektorBrief: string;
  chapter: PlotChapter;
  allChapters: PlotChapter[];
  previousChaptersMarkdown: string;
  existingManuskript: string;
  weave: boolean;
  zielWortzahl: number | null;
  zielWortzahlSzeneMax?: number | null;
  needsBlock?: string;
  autorBias?: string;
  pathBBlock?: string;
  continuityBuffer?: string;
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** Live wait-dialog label (e.g. expand retries). */
  onProgress?: (label: string) => Promise<void>;
  /** Cap expand retries (Alles erzeugen: 1; Einzelkapitel: 2). */
  maxExpands?: number;
}): Promise<ManuskriptChapterWriteResult & { wordCount: number; expanded: boolean }> {
  const { min, max } = manuskriptWordsPerChapter(
    input.zielWortzahl,
    input.allChapters.length,
    input.zielWortzahlSzeneMax,
  );
  const acceptFloor = Math.round(min * MANUSKRIPT_CHAPTER_ACCEPT_FLOOR_PCT);
  const maxExpands = Math.max(0, Math.min(2, input.maxExpands ?? 2));
  const chapterLabel = `Kapitel ${input.chapter.number}${
    input.chapter.title?.trim() ? ` — „${input.chapter.title.trim()}“` : ""
  }`;

  async function once(expandBody?: string) {
    try {
      return await writeManuskriptChapter({ ...input, expandBody });
    } catch (error) {
      if (!isAiAbortError(error) || expandBody) throw error;
      return writeManuskriptChapter({ ...input, expandBody });
    }
  }

  let written = await once();
  let expanded = false;
  let expands = 0;
  while (
    expands < maxExpands &&
    written.wordCount < min &&
    written.wordCount < max
  ) {
    expands += 1;
    await input.onProgress?.(
      `${chapterLabel}: zu kurz (${written.wordCount}/${min} Wörter) — Erweiterung ${expands}/${maxExpands} …`,
    );
    const body = parsePlotChapters(written.chapterMarkdown)[0]?.body ?? "";
    written = await once(body || undefined);
    expanded = true;
  }
  if (written.wordCount < acceptFloor) {
    throw new Error(
      `Kapitel ${input.chapter.number} zu kurz (${written.wordCount} Wörter, Minimum ${min}). Bitte Erzeugen erneut.`,
    );
  }
  return { ...written, expanded };
}

/**
 * Fanbase / Testleser: honest, direct reader feedback — suggestions only.
 * Returns prose critique (pipeline-compatible). Prefer
 * {@link collectManuskriptLeserFeedback} for the structured Dialog.
 */
export async function critiqueManuskriptMitTestleser(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  editorial: RomanEditorial;
  manuskriptText: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
}): Promise<ManuskriptCritiqueResult> {
  const feedback = await collectManuskriptLeserFeedback(input);
  const lines = [
    `Weiterlesen: ${feedback.weiterlesen ? "Ja" : "Nein"}`,
    "",
    "## Leser-Feedback (Prosa)",
    feedback.gesamt,
    "",
    "## Regel- & Logik-Check",
    `Regeln: ${feedback.regelnStatus}`,
    feedback.checkDetail,
    "",
    "## Änderungsaufträge",
    ...(feedback.aenderungsPrompts.length > 0
      ? feedback.aenderungsPrompts.map(
          (p, i) =>
            `${i + 1}. [${p.scope}${
              p.kapitel.length ? ` Kap. ${p.kapitel.join(",")}` : ""
            }] ${p.titel}\n${p.anweisung}`,
        )
      : feedback.vorschlaege.map(
          (v, i) =>
            `${i + 1}. ${v.text}${v.stelle ? ` (${v.stelle})` : ""}`,
        )),
  ];
  if (feedback.genreVergleich.trim()) {
    lines.push("", "## Genre-Vergleich", feedback.genreVergleich);
  }
  return {
    critique: lines.join("\n").slice(0, CLIP.critique),
    modelLabel: feedback.modelLabel,
  };
}

/**
 * Structured Testleser feedback for Manuskript (wrapper).
 * Prefer {@link collectStageLeserFeedback} when a full roman is available.
 */
export async function collectManuskriptLeserFeedback(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  editorial: RomanEditorial;
  manuskriptText: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
}): Promise<RomanLeserFeedback> {
  const { collectStageLeserFeedback } = await import(
    "@/lib/roman/leser-feedback-collect"
  );
  const { emptyBuchruecken, emptyVorsatz } = await import(
    "@/lib/roman/front-matter"
  );
  return collectStageLeserFeedback({
    roman: {
      id: "feedback-temp",
      title: input.title,
      manuskriptRaw: "",
      stilbibel: "",
      aktuelleZusammenfassung: "",
      genre: input.genre,
      praemisse: "",
      perspektive: "",
      zeitform: "",
      tonalitaet: "",
      charaktere: [],
      weltSchauplaetze: "",
      weltRegeln: "",
      szenenRaster: [],
      kiRegelwerk: "",
      fanPersonaName: input.fanPersonaName,
      fanPersonaProfil: input.fanPersonaProfil,
      editorial: {
        ...input.editorial,
        manuskriptText: input.manuskriptText,
      },
      coverImageDataUrl: "",
      coverPrompt: "",
      autorName: "",
      buchruecken: emptyBuchruecken(),
      vorsatz: emptyVorsatz(),
      ideenChat: [],
      createdAt: "",
      updatedAt: "",
    },
    stage: "manuskript",
  });
}

/**
 * Entwicklungslektor: dramaturgical suggestions with full upstream context.
 */
export async function critiqueManuskriptMitEntwicklungslektor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  editorial: RomanEditorial;
  ideeKurz: string;
  grobRegeln?: string;
  charaktere?: RomanCharakter[];
  weltSchauplaetze?: string;
  weltRegeln?: string;
  szenenplot: string;
  manuskriptText: string;
}): Promise<ManuskriptCritiqueResult> {
  const text = input.manuskriptText.trim();
  if (!hasFilledManuskript(text)) {
    throw new Error("Zuerst ein Manuskript anlegen.");
  }

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const expose = exposeTextFromEditorial(input.editorial);
  const chars =
    formatCharaktere(input.charaktere ?? []) || "(noch keine Steckbriefe)";
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);

  const userText = `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Alter: ${
    input.editorial.zielAlterMin != null || input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin ?? "?"}-${input.editorial.zielAlterMax ?? "?"}`
      : "?"
  } · Lesestufe: ${input.editorial.lesestufe || "—"}

${compliance}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Basis-Regeln
${(input.grobRegeln ?? "").trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${(input.weltSchauplaetze ?? "").trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${(input.weltRegeln ?? "").trim().slice(0, CLIP.weltRegeln) || "(leer)"}

# Kapitelgerüst
${input.szenenplot.trim().slice(0, CLIP.szenenplot) || "(leer)"}

# Manuskript (zu prüfen)
${text.slice(0, CLIP.manuskript)}

Auftrag als Entwicklungslektor:
Gegenlese dramaturgisch gegen ALLE Upstream-Artefakte — und knallhart gegen Regeln + innere Logik/Kontinuität — mit Vorschlägen, die man direkt einbauen kann.
Fokus: Logiklöcher, Motivation, Figurenbögen, Spannungshänger, Pacing, Widersprüche zu Plot/Welt/Idee, Vermeidung von KI-Mittelmaß.
Keine separate Marktanalyse-Bedürfnis-Pflicht.

Form:
1. Regel- & Logik-Check (Regeln / Logik — je erfüllt/teilweise/fehlt)
2. Kurze Einschätzung (Stärken + Risiken, 4–8 Sätze)
3. 4–8 konkrete Einbau-Vorschläge, nummeriert, actionable (zuerst Regel-/Logik-Lücken):
   - Wo (z. B. „Kapitel 3, nach dem Dialog …“)
   - Was fehlt / kippt (ggf. Upstream-Ursache)
   - Wie einbauen (1–3 konkrete Sätze oder Beat-Anweisung zum Umschreiben)
4. Optional: 1 Priorität („zuerst dies“)

Regeln:
- Auf Deutsch, klar, ohne Floskeln.
- Du schreibst das Manuskript NICHT um — nur Vorschläge zum Einbauen.
- Keine Stil-Mikrokorrekturen, außer sie blockieren Verständnis oder Charakterstimme.`;

  const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Zusatzauftrag Manuskript-Lektorat:
Du bist Entwicklungslektor:in. Liefere einbaubare Nacharbeitspunkte mit Stellenbezug.
Du änderst den Text nicht selbst.`;

  const critique = (
    await generateText({
      model,
      systemInstruction: system,
      userText,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
    })
  ).trim();

  if (!critique || critique.length < 40) {
    throw new Error("Entwicklungslektor lieferte keine brauchbare Kritik.");
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: model.label };
}

/**
 * Fachberater (+ Schreib-Coach lens): sensitive reading + craft suggestions to embed.
 */
export async function critiqueManuskriptMitFachberater(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  editorial: RomanEditorial;
  ideeKurz: string;
  manuskriptText: string;
}): Promise<ManuskriptCritiqueResult> {
  const text = input.manuskriptText.trim();
  if (!hasFilledManuskript(text)) {
    throw new Error("Zuerst ein Manuskript anlegen.");
  }

  const fach = await resolveRomanKiRolle("fachberater");
  const coach = await resolveRomanKiRolle("schreib_coach");
  const expose = exposeTextFromEditorial(input.editorial);
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);

  const userText = `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Alter: ${
    input.editorial.zielAlterMin != null || input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin ?? "?"}-${input.editorial.zielAlterMax ?? "?"}`
      : "?"
  } · Lesestufe: ${input.editorial.lesestufe || "—"}

${compliance}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Manuskript (zu prüfen)
${text.slice(0, CLIP.manuskript)}

Auftrag als Fachberater:in und Schreib-Coach:
Gegenlese auf Respekt/Plausibilität UND handwerkliche Klarheit — und knallhart gegen Regeln + innere Logik — mit Vorschlägen zum Einbauen.
Achte zusätzlich auf austauschbare KI-Mittelware und fehlende Eigenstimme.
Keine separate Marktanalyse-Bedürfnis-Pflicht.

Prüfe u. a.:
- Sensible Darstellungen, Stereotypen, unnötige Klischees
- Altersgerechte Sprache und Lesbarkeit
- Figurenstimme, Dialognatürlichkeit, unklare Passagen
- Fachliche oder lebensnahe Plausibilität, wo relevant
- Logiklöcher und Spannungshänger

Form:
1. Regel- & Logik-Check (Regeln / Logik — je erfüllt/teilweise/fehlt)
2. Kurze Einschätzung (Stärken + Risiken, 3–6 Sätze)
3. 4–8 konkrete Einbau-Vorschläge, nummeriert (zuerst Regel-/Logik-Lücken):
   - Wo (z. B. „Kapitel 2 → …“)
   - Warum (kurz)
   - Wie einbauen (konkrete Alternative oder Umschreib-Hinweis)
4. Härtegrad je Punkt: kritisch / optional

Regeln:
- Auf Deutsch, klar, ohne Moralpredigt.
- Du schreibst das Manuskript NICHT um — nur Vorschläge.
- Keine Verbote ohne Begründung.`;

  const system = `${fach.rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Ergänzung Schreib-Coach (Handwerk):
${coach.rolle.systemPrompt.slice(0, 4_000)}

Zusatzauftrag Manuskript-Gegenlese:
Du bist Fachberater:in und Schreib-Coach in einem. Liefere einbaubare Vorschläge mit Stellenbezug.
Du änderst den Text nicht selbst.`;

  const critique = (
    await generateText({
      model: fach.model,
      systemInstruction: system,
      userText,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
    })
  ).trim();

  if (!critique || critique.length < 40) {
    throw new Error("Fachberater lieferte keine brauchbare Kritik.");
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: fach.model.label };
}

/**
 * Weave critique (Lektor, Fachberater or Testleser) + author comment into Manuskript.
 */
export async function weaveManuskriptFromKritik(input: {
  buchTyp: RomanBuchTyp;
  manuskriptText: string;
  critique: string;
  authorComment: string;
  critiqueLabel: string;
}): Promise<{ manuskriptText: string; modelLabel: string }> {
  if (!hasFilledManuskript(input.manuskriptText)) {
    throw new Error("Manuskript fehlt.");
  }
  const critique = input.critique.trim();
  if (critique.length < 40) {
    throw new Error("Kritik fehlt.");
  }

  const co = await resolveRomanKiRolle("co_autor");
  const { comment, hasExplicitComment } = resolveAuthorWeaveComment(
    input.authorComment,
  );
  const hasChapters = parsePlotChapters(input.manuskriptText).length >= 2;

  const raw = await generateText({
    model: co.model,
    systemInstruction: `${co.rolle.systemPrompt}

${buildWeaveSystemAddendum({
  kind: "manuskript",
  outputFormatHint: `${MARK_START} … ${MARK_ENDE} (Prosa, kein JSON).`,
})}

Zusatzauftrag: Verwebe die ${input.critiqueLabel}-Vorschläge in das Manuskript.${
      hasChapters
        ? " Behalte jede Kapitelüberschrift in der Form „Kapitel N — Titel“ (ohne Rauten/Markdown) und die Kapitelreihenfolge. Keine Kapitelüberschrift weglassen."
        : ""
    }
Nur ${MARK_START} … ${MARK_ENDE}.`,
    userText: `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Kommentar der Autor:in zur Übernahme (verbindliche Leitplanke)
${comment}

${buildCommentedWeaveRules({ kind: "manuskript", hasExplicitComment })}

${MANUSKRIPT_HEADING_FORM_HINT}

${MANUSKRIPT_CHAPTER_PROSE_RULES}
Das Kapitelgerüst bleibt die Kapitel-Gesetzeslage: kein Kapitel streichen oder durch Meta-Notizen ersetzen.

# ${input.critiqueLabel} (Vorschlagsliste zum Einbauen)
${critique.slice(0, CLIP.critique)}

# Bisheriges Manuskript
${input.manuskriptText.trim().slice(0, CLIP.manuskript)}

Schreibe das VOLLSTÄNDIGE neue Manuskript.${
      hasChapters
        ? " Jedes Kapitel MUSS mit „Kapitel N — Titel“ beginnen (ohne ##), danach eine Leerzeile, vor dem nächsten Kapitel drei Leerzeilen. Alle bisherigen Kapitelnummern bleiben erhalten und enthalten echte Prosa."
        : ""
    }
Antworte EXAKT:
${MARK_START}
(vollständiges Manuskript)
${MARK_ENDE}`,
    preferJson: false,
    maxTokens: 8_000,
    timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
  });

  const manuskriptText = normalizeManuskriptDocument(
    parseManuskriptText(raw, "Co-Autor (Manuskript-Weave)"),
  );
  if (hasChapters) {
    const chapters = parsePlotChapters(manuskriptText);
    if (chapters.length < 2) {
      throw new Error(
        "Co-Autor hat die Kapitelüberschriften weggelassen. Bitte Übernahme erneut versuchen.",
      );
    }
    for (const ch of chapters) {
      assertRealManuskriptProse(ch.body, ch.number, ch.title);
    }
  }

  return {
    manuskriptText,
    modelLabel: co.model.label,
  };
}

/**
 * Lektor brief + sequential Co-Autor chapters with length contracts.
 * Optional `onChapterWritten` persists after each chapter so timeouts
 * do not discard already finished prose.
 */
export async function suggestManuskriptFromLektorUndCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenplot: string;
  existingManuskript: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
  /**
   * Called after each chapter with the full document so far (+ optional continuity).
   */
  onChapterWritten?: (
    partialManuskript: string,
    chapterNumber: number,
    meta?: { storyState: RomanStoryState | null },
  ) => Promise<void>;
  /** Live wait-dialog status (chapter + current sub-step). */
  onProgress?: (label: string) => Promise<void>;
  /**
   * Alles erzeugen: fewer LLM calls (deterministic continuity, no Path-B,
   * one expand max, no story-state extract, no book-length expand rounds).
   * Keeps the run under control for 10–20 chapters.
   */
  leanFullBook?: boolean;
}): Promise<ManuskriptSuggestResult> {
  const report = async (label: string) => {
    await input.onProgress?.(label);
  };
  const lean = Boolean(input.leanFullBook);

  await report("Arbeitsbrief: Entwicklungslektor bereitet das Buch vor …");
  const brief = await briefManuskriptFromLektor(input);
  const total = brief.chapters.length;
  await report(
    lean
      ? `Schreibbrief fertig · ${total} Kapitel nacheinander schreiben …`
      : `Schreibbrief fertig · ${total} Kapitel — unkonventionelle Beats vorbereiten …`,
  );
  const needsBlock = manuskriptNeedsPromptBlock(input.editorial);
  const autorBias = formatAutorBiasFromCharaktere(input.charaktere);
  const { min: chapterMin } = manuskriptWordsPerChapter(
    brief.zielWortzahl,
    brief.chapters.length,
    brief.zielWortzahlSzeneMax,
  );
  const pathBByChapter = new Map<number, string>();
  if (!lean) {
    const keyChapters = new Set(pickKeyChapterNumbers(brief.chapters));
    for (const num of keyChapters) {
      const ch = brief.chapters.find((c) => c.number === num);
      if (!ch) continue;
      try {
        await report(
          `Kapitel ${num}/${total}${
            ch.title?.trim() ? ` — „${ch.title.trim()}“` : ""
          }: unkonventionellen Beat wählen …`,
        );
        const beat = await chooseUnconventionalChapterBeat({
          chapter: ch,
          sharedContext: brief.sharedContext,
          needsHint: needsBlock,
        });
        const block = formatPathBBlock(beat);
        if (block) pathBByChapter.set(num, block);
      } catch {
        /* A/B optional — write without if the micro-call fails */
      }
    }
  }

  const parts: string[] = [];
  const expandedChapters: number[] = [];
  // Fresh draft starts empty memory; resume would use editorial.storyState if we ever support it.
  let storyState: RomanStoryState | null = null;

  for (const chapter of brief.chapters) {
    const chapterLabel = `Kapitel ${chapter.number}/${total}${
      chapter.title?.trim() ? ` — „${chapter.title.trim()}“` : ""
    }`;
    const previousMarkdown = parts.join("\n\n\n\n");
    const previousTail =
      previousMarkdown.trim().length > 80
        ? previousMarkdown.trim().slice(-CONTINUITY_PREV_TAIL_CHARS)
        : "";

    await report(`${chapterLabel}: Continuity vorbereiten …`);
    let continuityBuffer: string;
    if (lean) {
      continuityBuffer = buildDeterministicChapterContextBuffer({
        storyState,
        chapter,
        previousTail,
        lektorBriefSnippet: brief.lektorBrief,
      });
    } else {
      const assembled = await assembleManuskriptChapterContext({
        storyState,
        chapter,
        previousTail,
        sharedContextSnippet: brief.sharedContext,
        lektorBriefSnippet: brief.lektorBrief,
      });
      continuityBuffer = assembled.buffer;
    }

    await report(`${chapterLabel}: Co-Autor schreibt …`);
    const written = await writeManuskriptChapterWithLengthGate({
      coAutorSystem: brief.coAutorSystem,
      sharedContext: brief.sharedContext,
      lektorBrief: brief.lektorBrief,
      chapter,
      allChapters: brief.chapters,
      previousChaptersMarkdown: previousMarkdown,
      existingManuskript: input.existingManuskript,
      weave: brief.weave,
      zielWortzahl: brief.zielWortzahl,
      zielWortzahlSzeneMax: brief.zielWortzahlSzeneMax,
      needsBlock,
      autorBias,
      pathBBlock: pathBByChapter.get(chapter.number),
      continuityBuffer,
      szenenplotStructured: input.editorial.szenenplotStructured,
      onProgress: report,
      maxExpands: lean ? 1 : 2,
    });
    if (written.expanded) expandedChapters.push(chapter.number);
    parts.push(written.chapterMarkdown);

    // Lean: skip story-state LLM — continuity uses previousTail + plot focus only.
    if (!lean) {
      const body =
        parsePlotChapters(written.chapterMarkdown)[0]?.body ?? "";
      await report(`${chapterLabel}: Story-State speichern …`);
      storyState = await extractManuskriptStoryState({
        previous: storyState,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        chapterBody: body,
      });
    }

    const partial = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
      requiredFromPlot: input.szenenplot,
    });
    if (input.onChapterWritten) {
      await input.onChapterWritten(partial, chapter.number, { storyState });
    }
    await report(
      `${chapterLabel}: fertig (${written.wordCount} Wörter)${
        written.expanded ? " · nachgezogen" : ""
      }`,
    );
  }

  // Book-level expand only while under 90% Ziel — skip in lean full-book runs.
  const ziel = brief.zielWortzahl;
  let rounds = 0;
  while (
    !lean &&
    ziel != null &&
    ziel > 0 &&
    !manuskriptBookNearOrOverTarget(countWords(parts.join("\n\n\n\n")), ziel) &&
    countWords(parts.join("\n\n\n\n")) <
      Math.round(ziel * MANUSKRIPT_BOOK_WORD_FLOOR_PCT) &&
    rounds < 2
  ) {
    rounds += 1;
    await report(
      `Längen-Pass ${rounds}/2: Buch noch unter Zielwortzahl — kürzeste Kapitel erweitern …`,
    );
    const doc = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
      requiredFromPlot: input.szenenplot,
    });
    const byNum = new Map(
      parsePlotChapters(doc).map((c) => [c.number, c] as const),
    );
    const shortest = [...byNum.values()]
      .map((c) => ({
        chapter: brief.chapters.find((b) => b.number === c.number) ?? c,
        words: manuskriptChapterWordCount(c.body),
        body: c.body,
      }))
      .sort((a, b) => a.words - b.words)
      .slice(0, 6);

    for (const item of shortest) {
      const currentWords = countWords(parts.join("\n\n\n\n"));
      if (
        manuskriptBookNearOrOverTarget(currentWords, ziel) ||
        currentWords >= Math.round(ziel * MANUSKRIPT_BOOK_WORD_FLOOR_PCT)
      ) {
        break;
      }
      const expandLabel = `Längen-Pass: Kapitel ${item.chapter.number}/${total}${
        item.chapter.title?.trim()
          ? ` — „${item.chapter.title.trim()}“`
          : ""
      } erweitern …`;
      await report(expandLabel);
      const previousMarkdown = parts.join("\n\n\n\n");
      const { buffer: continuityBuffer } = await assembleManuskriptChapterContext({
        storyState,
        chapter: item.chapter,
        previousTail: previousMarkdown.trim().slice(-CONTINUITY_PREV_TAIL_CHARS),
        sharedContextSnippet: brief.sharedContext,
        lektorBriefSnippet: brief.lektorBrief,
      });
      const written = await writeManuskriptChapter({
        coAutorSystem: brief.coAutorSystem,
        sharedContext: brief.sharedContext,
        lektorBrief: brief.lektorBrief,
        chapter: item.chapter,
        allChapters: brief.chapters,
        previousChaptersMarkdown: previousMarkdown,
        existingManuskript: input.existingManuskript,
        weave: brief.weave,
        zielWortzahl: brief.zielWortzahl,
        zielWortzahlSzeneMax: brief.zielWortzahlSzeneMax,
        needsBlock,
        autorBias,
        continuityBuffer,
        szenenplotStructured: input.editorial.szenenplotStructured,
        expandBody: item.body,
      });
      const idx = brief.chapters.findIndex((c) => c.number === item.chapter.number);
      if (idx >= 0) {
        parts[idx] = written.chapterMarkdown;
        if (!expandedChapters.includes(item.chapter.number)) {
          expandedChapters.push(item.chapter.number);
        }
      }
      const body =
        parsePlotChapters(written.chapterMarkdown)[0]?.body ?? item.body;
      storyState = await extractManuskriptStoryState({
        previous: storyState,
        chapterNumber: item.chapter.number,
        chapterTitle: item.chapter.title,
        chapterBody: body,
      });
      const partial = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
        requiredFromPlot: input.szenenplot,
      });
      if (input.onChapterWritten) {
        await input.onChapterWritten(partial, item.chapter.number, {
          storyState,
        });
      }
    }
  }

  await report("Manuskript zusammenführen und abschließen …");

  const manuskriptText = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
    requiredFromPlot: input.szenenplot,
  });
  const words = countWords(manuskriptText);
  const chaptersUnderMin = manuskriptChaptersUnderMin(manuskriptText, chapterMin);

  return {
    manuskriptText,
    woven: brief.weave,
    modelLabel: brief.proseModelLabel,
    lektorLabel: brief.lektorLabel,
    storyState,
    wordMetrics: {
      words,
      zielWortzahl: brief.zielWortzahl,
      chaptersUnderMin,
      expandedChapters: [...expandedChapters].sort((a, b) => a - b),
    },
  };
}

/** Export metrics formatter for pipeline summaries. */
export { formatManuskriptWordMetrics };
