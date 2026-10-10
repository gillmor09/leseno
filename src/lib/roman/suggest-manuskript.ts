/**
 * Manuskript: Lektor briefs once; Co-Autor writes chapters strictly in order
 * (storyState + Wissensgraph after each chapter). Frozen schreibPrompts → slim
 * packets. Quality/continuity over parallel speed.
 * Stored in `editorial.manuskriptText` (+ `editorial.storyState`).
 *
 * Alles erzeugen resumes: chapters already at/above the chapter word *min*
 * are kept — shorter ones are rewritten.
 */

import {
  AI_FETCH_TIMEOUT_MAX_MS,
  AI_LONG_PROSE_TIMEOUT_MS,
  isAiAbortError,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  countWords,
  exposeTextFromEditorial,
  formatFactContractsForChapter,
  formatWissensGraphForPrompt,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanLeserFeedback,
  type RomanStoryState,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  enrichSzenenplotSpatialContinuity,
  szenenplotNeedsSpatialEnrichment,
} from "@/lib/roman/enrich-szenenplot-spatial";
import {
  hasFrozenSchreibPrompts,
  resolveManuskriptChapterPacket,
} from "@/lib/roman/manuskript-chapter-packet";
import { runManuskriptPostDraftQualityGates } from "@/lib/roman/manuskript-chapter-quality-gates";
import {
  GenerateChunkContinueError,
  isGenerateChunkContinueError,
  type GenerateChunkBudget,
} from "@/lib/roman/pipeline/generate-budget";
import {
  CONTINUITY_PREV_TAIL_CHARS,
  CONTINUITY_PREV_TAIL_CHARS_FROZEN,
  extractManuskriptStoryState,
} from "@/lib/roman/manuskript-continuity";
import { freezeSzenenplotSchreibPrompts } from "@/lib/roman/suggest-szenenplot-detail";
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
import { formatCharaktere } from "@/lib/roman/fundament";
import { growWissensGraphFromChapterBodies } from "@/lib/roman/wissens-graph";
import {
  buildRomanSlimCanon,
  buildRomanStaticBookPrefix,
} from "@/lib/roman/prompt-prefix";
import {
  buildCrossChapterStyleAnchor,
  buildVerbessernRulesAndTone,
} from "@/lib/roman/roman-verbessern-context";
import {
  formatChapterHeading,
  formatManuskriptChapterBlock,
  formatManuskriptChapterHeading,
  extractManuskriptChapterBody,
  neutralizeEmbeddedChapterHeadings,
  MANUSKRIPT_CHAPTER_PROSE_RULES,
  MANUSKRIPT_HEADING_FORM_HINT,
  assertRealManuskriptProse,
  normalizeManuskriptDocument,
  parsePlotChapters,
  sanitizeChapterTitle,
  scrubManuskriptChapterBody,
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
  ROMAN_PROSE_MAX_TOKENS,
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
 *
 * Why high maxTokens: German prose ≈ 1.5–2 tokens/word. A 3.5–5k-word chapter
 * alone needs ~7–10k output tokens; if Claude hits max_tokens it truncates
 * mid-scene (stop_reason length). Floor 30k — 20k was observed fully used.
 */
const MANUSKRIPT_CHAPTER_TOKENS_MIN = ROMAN_PROSE_MAX_TOKENS;
const MANUSKRIPT_CHAPTER_TOKENS_MAX = 40_000;
const MANUSKRIPT_CHAPTER_TIMEOUT_MS = AI_FETCH_TIMEOUT_MAX_MS;
const MAX_CHAPTERS = 24;

/** Output token floor/cap — never pin to the chapter word minimum. */
function resolveManuskriptChapterMaxTokens(minWords: number, maxWords: number): number {
  const need = Math.ceil(Math.max(minWords, maxWords, 900) * 1.7) + 2_000;
  return Math.min(
    MANUSKRIPT_CHAPTER_TOKENS_MAX,
    Math.max(MANUSKRIPT_CHAPTER_TOKENS_MIN, need),
  );
}

export type ManuskriptBriefResult = {
  lektorBrief: string;
  lektorLabel: string;
  chapters: PlotChapter[];
  sharedContext: string;
  /**
   * Slim canon for Sonnet prompt-caching (not the full Spec/Recherche dump).
   */
  cacheablePrefix: string;
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
  /** Live-grown knowledge graph after chapter writes (may equal input). */
  wissensGraph: RomanWissensGraph | null;
  /**
   * Szenenplot with schreibPrompts frozen at run start (persist so later
   * patches stay on the slim frozen path).
   */
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** Length / target metrics for toast + history. */
  wordMetrics: {
    words: number;
    zielWortzahl: number | null;
    chaptersUnderMin: number[];
    expandedChapters: number[];
    /** Chapters reused from existing manuskript (no new LLM write). */
    resumedChapters: number[];
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
  // Drop echoed heading + neutralize mid-prose „Kapitel N — …“ so length/parse
  // cannot truncate this chapter or steal text into Kap. 1.
  return neutralizeEmbeddedChapterHeadings(
    stripLeadingChapterHeadings(body, chapter.number),
  );
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
 * Gemini (Assist) writes one Lektor-Brief; Sonnet later gets only slim canon +
 * per-chapter packet — not this full bible again.
 * Pass `tonalitaet` (Basics Schreiber-Ton) — otherwise humor/voice never reach prose.
 */
export async function briefManuskriptFromLektor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  /** Schreiber Sprache & Tonalität from Basics (`roman_kontext.tonalitaet`). */
  tonalitaet?: string;
  stilbibel?: string;
  kiRegelwerk?: string;
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
  const tonalitaet = (input.tonalitaet ?? "").trim();
  const grobRegeln =
    input.grobRegeln.trim() || (input.editorial.grobRegeln ?? "").trim();

  const chapterIndex = chapters
    .map((c) => `- ${formatChapterHeading(c)}`)
    .join("\n");

  const lektor = await resolveRomanKiRolle("entwicklungslektor");
  const assistModel = await resolveRomanAssistModel();
  const fullPrefix = buildRomanStaticBookPrefix({
    buchTyp: input.buchTyp,
    title: input.title,
    genre: input.genre,
    ideeKurz: input.ideeKurz,
    rechercheDossier: input.editorial.rechercheDossier ?? "",
    tonalitaet,
    grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
  });
  const slimCanon = buildRomanSlimCanon({
    buchTyp: input.buchTyp,
    title: input.title,
    genre: input.genre,
    ideeKurz: input.ideeKurz,
    rechercheDossier: input.editorial.rechercheDossier ?? "",
    tonalitaet,
    grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
    wissensGraph: input.editorial.wissensGraph,
  });
  const lektorDynamic = `# Kapitelübersicht (Kapitelgerüst)
${chapterIndex}

# Kapitelgerüst
${plot.slice(0, CLIP.szenenplot)}

# Bisheriges Manuskript
${weave ? input.existingManuskript.trim().slice(0, CLIP.manuskript) : "(leer — neu schreiben)"}

Auftrag als Entwicklungslektor:
Arbeitsbrief an den Co-Autor für die kapitelweise Manuskript-Prosa.
Der Co-Autor erfindet KEINE Plot-Logik neu (die steckt in Szenenverträgen) — er schreibt Stil, Ton, Emotion.
- Stimme, Tempo, Perspektive, Tabus für das ganze Buch
- Sprache & Tonalität (Humor, Wortwitz, Register) aus dem Prefix verbindlich machen — buchweit spürbar, nicht nur einmal
- Basis-/Grob-Regeln einhalten und im Brief als MUSS nennen
- Emotion & Show-don't-tell: wo Körper/Dialog/Wahrnehmung statt Erklärung; wo Nähe/Distanz, Humor, Spannung spürbar werden müssen
- Zentrale Spannungsbögen nur als Haltepunkte (Setup/Peak/Payoff) — keine neue Handlungsanalyse
- Übergänge/Continuity-Hinweise knapp; keine Kapitel umschreiben oder streichen
- Was über Genre-Mittelmaß hinausgehen muss (Eigenstimme, konkrete Bilder, keine KI-Floskeln)
${weave ? "- Was am bestehenden Manuskript behalten oder schärfen (Stil/Emotion — KEINE Kapitel streichen)" : ""}
VERBOTEN im Brief: Kapitel aus dem Kapitelgerüst streichen, zusammenlegen, als „entfällt“ markieren oder durch Meta-Notizen ersetzen. Alle ${chapters.length} Kapitel bleiben.
Kein JSON — klarer Brief. Kein fertiger Romantext. Kurz halten (max. ~800 Wörter).`;

  const lektorDraft = (
    await generateText({
      model: assistModel,
      systemInstruction: `${lektor.rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Manuskript-Brief:
Du bereitest die kapitelweise Prosa dramaturgisch vor. Arbeitsbrief für den Co-Autor. Knapp.`,
      cacheablePrefix: fullPrefix,
      userText: lektorDynamic,
      maxTokens: 2_000,
      timeoutMs: 60_000,
    })
  ).trim();

  if (!lektorDraft || lektorDraft.length < 40) {
    throw new Error("Entwicklungslektor lieferte keinen brauchbaren Schreib-Brief.");
  }

  const co = await resolveRomanKiRolle("co_autor");
  const autorBias = formatAutorBiasFromCharaktere(input.charaktere);
  const rulesAndTone = buildVerbessernRulesAndTone({
    roman: {
      tonalitaet,
      stilbibel: (input.stilbibel ?? "").trim(),
      kiRegelwerk: (input.kiRegelwerk ?? "").trim(),
      genre: input.genre,
    },
    editorial: input.editorial,
  });
  /** Slim canon + Regeln/Ton — Stilanker injected after Kap. 1–2 exist. */
  const baseCacheablePrefix = `${slimCanon}\n\n${rulesAndTone}`.trim();
  const sharedContext = `${baseCacheablePrefix}

${autorBias}`;

  return {
    lektorBrief: lektorDraft.slice(0, 6_000),
    lektorLabel: assistModel.label,
    chapters,
    sharedContext,
    cacheablePrefix: baseCacheablePrefix,
    coAutorSystem: `${co.rolle.systemPrompt}\n\n${ROMAN_EXCELLENCE_MANDATE}`,
    proseModelLabel: co.model.label,
    zielWortzahl: input.editorial.zielWortzahlRoman,
    zielWortzahlSzeneMax: input.editorial.zielWortzahlSzeneMax,
    weave,
  };
}

/**
 * Co-Autor writes a single chapter; caller appends and persists.
 * Prefer `chapterPacket` + slim `cacheablePrefix` (Sonnet sees ~few k dynamic
 * tokens). Full book bible must NOT be passed as cacheablePrefix for prose.
 */
export async function writeManuskriptChapter(input: {
  coAutorSystem: string;
  sharedContext: string;
  /**
   * Prefer slim canon (~2–4k chars). Full Spec/Recherche dump is too expensive
   * on Sonnet — assemble that into `chapterPacket` via Gemini first.
   */
  cacheablePrefix?: string;
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
  /**
   * Gemini chapter packet (Gerüst + Graph + Continuity + Lektor-Fokus).
   * When set, Sonnet gets packet + prev tail — not the full bible/brief.
   */
  chapterPacket?: string;
  /** Legacy continuity buffer if no chapterPacket. */
  continuityBuffer?: string;
  /**
   * Override prev-prose seam length (default CONTINUITY_PREV_TAIL_CHARS).
   * Use CONTINUITY_PREV_TAIL_CHARS_FROZEN when schreibPrompts are frozen.
   */
  previousTailChars?: number;
  /** Structured Kapitelgerüst beats (preferred over markdown body). */
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** When set, expand this body instead of writing from scratch. */
  expandBody?: string;
  /**
   * Research / knowledge-graph snippets for length expands —
   * weave as anecdote or dialog (lived, not lecture).
   */
  expandMaterial?: string;
}): Promise<ManuskriptChapterWriteResult & { wordCount: number }> {
  const { model } = await resolveRomanKiRolle("co_autor");
  const { min, max } = manuskriptWordsPerChapter(
    input.zielWortzahl,
    input.allChapters.length,
    input.zielWortzahlSzeneMax,
  );
  const chapter = input.chapter;
  const heading = formatManuskriptChapterHeading(chapter);
  const packet = input.chapterPacket?.trim() ?? "";
  const continuity = input.continuityBuffer?.trim() ?? "";
  // Never fall back to full sharedContext bible when packet/continuity exists.
  const cacheablePrefix =
    input.cacheablePrefix?.trim() ||
    (!packet && !continuity ? input.sharedContext.trim() : "");
  const prevTailBudget =
    input.previousTailChars ??
    (packet || continuity ? CONTINUITY_PREV_TAIL_CHARS : 16_000);
  const prev =
    input.previousChaptersMarkdown.trim().length > 80
      ? input.previousChaptersMarkdown.trim().slice(-prevTailBudget)
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
  const material = input.expandMaterial?.trim() ?? "";

  let userText: string;
  if (packet) {
    // Slim path: packet already holds beats / graph / lektor focus / bias / path B.
    userText = expand
      ? `# Kapitel-Paket (verbindlich)
${packet.slice(0, 6_500)}
${needs}
# Kapitel ${chapter.number} — expandieren (Handlung behalten)
ZIEL: mindestens ${min} Wörter (Band ${min}–${max}). Aktuell zu kurz.

# Bisheriger Body (erweitern, nicht durch Kurzfassung ersetzen)
${input.expandBody!.trim().slice(0, 28_000)}

${
  material
    ? `# Stoff zum Einweben
${material.slice(0, 4_000)}
`
    : ""
}
Auftrag — VOLLSTÄNDIGER neuer Body für GENAU Kapitel ${chapter.number}:
- HARTE Bandbreite: ${min}–${max} Wörter. Verträge lückenlos (Szenen/Gerüst/Fakten/Arcs); Prosa = Ton/Emotion/SHOW — keine neuen Stränge.
- KEINE Kapitel-Überschrift. Keine Zeile „Kapitel X — …“ im Fließtext.
${MANUSKRIPT_CHAPTER_PROSE_RULES}`
      : `# Kapitel-Paket (verbindlich — alles was du brauchst)
${packet.slice(0, 6_500)}
${needs}
# Übergang — Ende Vorgänger (nahtlos anschließen)
${prev}

# Folgende Kapitel (nur Titel, NICHT schreiben)
${remaining || "(keins — dies ist das letzte Kapitel)"}

Auftrag — NUR Fließtext für GENAU Kapitel ${chapter.number} („${sanitizeChapterTitle(chapter.title, chapter.number) || heading}“):
- HARTE Bandbreite: ${min}–${max} Wörter.
- Zuerst Verträge lückenlos: Szenenverträge (alle MUSS-Beats), Gerüst-Plan, Verbote, Raum-/Prop-Spine, Arc-/Fakten-Verträge, Invarianten. Dann Prosa: Ton/Humor/Wortwitz/Emotion aus Slim-Canon — SHOW.
- Keine neuen Stränge/Props/Enthüllungen; FROZEN-Attrs und DARF-NICHT hart halten; hoch/runter und Prop-Ablage laut Spine — keine stillen Logik-Brüche.
- KEINE Kapitel-Überschrift. Niemals „Kapitel X — …“ im Fließtext.
${MANUSKRIPT_HEADING_FORM_HINT}

${MANUSKRIPT_CHAPTER_PROSE_RULES}
Erzähle DIESES Kapitel als Prosa.`;
  } else {
    const slimContext = continuity
      ? continuity.slice(0, 4_500)
      : cacheablePrefix
        ? "(Buch-Kontext liegt im Cache — hier nur der Schreibauftrag.)"
        : input.sharedContext.slice(0, 12_000);
    const contextHeader = continuity
      ? `# Context-Buffer (Continuity + Fokus)
${slimContext}`
      : `# Shared Context
${slimContext}`;

    userText = expand
      ? `${contextHeader}
${needs}${bias}
# Arbeitsbrief Entwicklungslektor
${input.lektorBrief.slice(0, 2_500)}

# Kapitel ${chapter.number} — expandieren (Handlung behalten)
${formatChapterHeading(chapter)}
ZIEL: mindestens ${min} Wörter (Band ${min}–${max}). Aktuell zu kurz.

# Bisheriger Body (erweitern, nicht durch Kurzfassung ersetzen)
${input.expandBody!.trim().slice(0, 28_000)}

${
  material
    ? `# Recherche- & Wissensstoff zum Einweben (verbindlich nutzen)
Wähle 2–4 passende Punkte und baue sie als Anekdote, Dialog, Erinnerung, Beobachtung oder Streit ein — erlebt, nicht doziniert. Keine Faktliste, kein Vortrag.
${material.slice(0, 4_000)}
`
    : ""
}
Auftrag — schreibe den VOLLSTÄNDIGEN neuen Body für GENAU Kapitel ${chapter.number}:
- HARTE Bandbreite: ${min}–${max} Wörter (zählbar). Unter ${min} unvollständig; über ${max} zu lang — streichen/verdichten.
- Behalte Plot, Figuren und Wendungen; erweitere mit Dialog, Sinneseindruck, Innenleben, klaren Beats.
${material ? "- Mindestens zwei konkrete Recherche-/Wissens-Details dramatisch einbauen (Dialog oder erlebte Anekdote).\n" : ""}- Autor-Bias und Figurenstimmen einhalten. Continuity-State nicht widersprechen.
- KEINE Kapitel-Überschrift. Keine Meta-Zeile „Kapitel N“. Niemals eine Zeile der Form „Kapitel X — …“ im Fließtext (auch nicht als Rückblick).
${MANUSKRIPT_CHAPTER_PROSE_RULES}`
      : `${contextHeader}
${needs}${bias}${pathB}
# Arbeitsbrief Entwicklungslektor
${input.lektorBrief.slice(0, 2_500)}

# Bereits geschriebene Kapitel — nur Übergang (Ende Vorgänger)
${prev}

# Dieses Kapitel (verbindlich aus dem Kapitelgerüst)
${formatChapterHeading(chapter)}
${
  formatStructuredChapterForManuskript(
    input.szenenplotStructured,
    chapter.number,
  ) || chapter.body.slice(0, 8_000)
}

# Noch folgende Kapitel (nur Orientierung, NICHT schreiben)
${remaining || "(keins — dies ist das letzte Kapitel)"}

Auftrag — schreibe NUR den Fließtext für GENAU Kapitel ${chapter.number} („${sanitizeChapterTitle(chapter.title, chapter.number) || heading}“):
- HARTE Bandbreite: ${min}–${max} Wörter (zählbar). Zielnähe wichtiger als Aufblasen.
- Unter ${min} unvollständig; über ${max} zu lang — lieber knapper und dichter.
- Continuity-State und harte Fakten einhalten — keine Drift.
- KEINE Kapitel-Überschrift — die setzt das System druckfertig („Kapitel N — Titel“ ohne Rauten).
- Niemals im Fließtext eine Zeile „Kapitel X — …“ schreiben (zerstört die Kapitelstruktur).
- Figurenstimmen und Autor-Bias aus den Steckbriefen einhalten (Subtext, Default unter Druck).
${pathB ? "- Pfad-B-Beat umsetzen (nicht den konventionellen Genre-Default).\n" : ""}- Nahtlos anschließen; Kernsatz/Funktion des Kapitels umsetzen; vollständig zu Ende schreiben.
- Keine KI-Mittelmaß-Prosa: konkrete Bilder, klare Figurenstimmen, keine Logiklöcher oder Spannungshänger.

${MANUSKRIPT_HEADING_FORM_HINT}

${MANUSKRIPT_CHAPTER_PROSE_RULES}
Erzähle DIESES Kapitel als Prosa — nicht über andere Kapitel sprechen.`;
  }

  const raw = await generateText({
    model,
    systemInstruction: `${input.coAutorSystem}

Zusatzauftrag Manuskript-Kapitel ${chapter.number}${expand ? " (Expand)" : ""}:
Genau Kapitel ${chapter.number} als Fließtext. Keine Kapitel-Überschrift (weder Markdown noch „Kapitel N — …“).
Kein ${MARK_START}/${MARK_ENDE}. Keine anderen Kapitel. Mindestens ${min} Wörter.
${MANUSKRIPT_CHAPTER_PROSE_RULES}`,
    cacheablePrefix: cacheablePrefix || undefined,
    userText,
    preferJson: false,
    maxTokens: resolveManuskriptChapterMaxTokens(min, max),
    timeoutMs: MANUSKRIPT_CHAPTER_TIMEOUT_MS,
    reasoningEffort: expand ? "low" : "none",
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
  cacheablePrefix?: string;
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
  chapterPacket?: string;
  continuityBuffer?: string;
  previousTailChars?: number;
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** For coverage check (FROZEN attrs / deltas). */
  wissensGraph?: RomanWissensGraph | null;
  storyState?: RomanStoryState | null;
  /** Recherche + graph facts for anecdote/dialog expands. */
  expandMaterial?: string;
  /** Live wait-dialog label (e.g. expand retries). */
  onProgress?: (label: string) => Promise<void>;
  /**
   * Stable prefix for progress lines, e.g. `Kapitel 3/16 — „Titel“`.
   * Keeps the wait dialog on the chapter currently being written.
   */
  progressChapterLabel?: string;
  /** Cap expand retries (Alles erzeugen: 1; Einzelkapitel: 2). */
  maxExpands?: number;
  /**
   * Alles erzeugen: do not abort the whole book if a chapter stays under
   * acceptFloor — keep prose and continue (listed in chaptersUnderMin).
   */
  softLengthGate?: boolean;
}): Promise<ManuskriptChapterWriteResult & { wordCount: number; expanded: boolean }> {
  const { min, max } = manuskriptWordsPerChapter(
    input.zielWortzahl,
    input.allChapters.length,
    input.zielWortzahlSzeneMax,
  );
  const acceptFloor = Math.round(min * MANUSKRIPT_CHAPTER_ACCEPT_FLOOR_PCT);
  const maxExpands = Math.max(0, Math.min(2, input.maxExpands ?? 2));
  const chapterNum = input.chapter.number;
  const chapterLabel =
    input.progressChapterLabel?.trim() ||
    `Kapitel ${chapterNum}${
      input.chapter.title?.trim() ? ` — „${input.chapter.title.trim()}“` : ""
    }`;

  async function once(expandBody?: string) {
    try {
      return await writeManuskriptChapter({
        ...input,
        expandBody,
        expandMaterial: expandBody ? input.expandMaterial : undefined,
      });
    } catch (error) {
      if (!isAiAbortError(error) || expandBody) throw error;
      return writeManuskriptChapter({
        ...input,
        expandBody,
        expandMaterial: expandBody ? input.expandMaterial : undefined,
      });
    }
  }

  await input.onProgress?.(
    `${chapterLabel}: Co-Autor schreibt (Ziel ${min}–${max} Wörter) …`,
  );
  let written = await once();

  // Sequential quality gates (Abdeckung → Raum → Sprache); verify at end.
  const structuredCh = input.szenenplotStructured?.chapters.find(
    (c) => c.number === chapterNum,
  );
  const factContractsBlock = formatFactContractsForChapter(
    input.wissensGraph,
    chapterNum,
    { storyState: input.storyState, maxChars: 1_600 },
  );
  {
    const gated = await runManuskriptPostDraftQualityGates({
      written: {
        chapterMarkdown: written.chapterMarkdown,
        wordCount: written.wordCount,
      },
      chapterNumber: chapterNum,
      chapterLabel,
      chapterPacket: input.chapterPacket,
      structuredChapter: structuredCh,
      factContractsBlock,
      wissensGraph: input.wissensGraph,
      extractBody: extractManuskriptChapterBody,
      wordCountOf: manuskriptChapterWordCount,
      rewrite: async (patchedPacket) => {
        const next = await writeManuskriptChapter({
          ...input,
          chapterPacket: patchedPacket || input.chapterPacket,
          expandBody: undefined,
        });
        return {
          chapterMarkdown: next.chapterMarkdown,
          wordCount: next.wordCount,
        };
      },
      onProgress: input.onProgress,
    });
    written = {
      ...written,
      chapterMarkdown: gated.chapterMarkdown,
      wordCount: gated.wordCount,
    };
  }

  let expanded = false;
  let expands = 0;
  while (
    expands < maxExpands &&
    written.wordCount < min &&
    written.wordCount < max
  ) {
    expands += 1;
    const body = extractManuskriptChapterBody(
      written.chapterMarkdown,
      chapterNum,
    );
    if (!body || manuskriptChapterWordCount(body) < 40) {
      throw new Error(
        `${chapterLabel}: Expand abgebrochen — Body für Kapitel ${chapterNum} nicht lesbar (${written.wordCount} Wörter gemeldet). Bitte erneut erzeugen.`,
      );
    }
    await input.onProgress?.(
      `${chapterLabel}: zu kurz (${written.wordCount}/${min} Wörter, Band bis ${max}) — Recherche/Dialog einweben ${expands}/${maxExpands} …`,
    );
    written = await once(body);
    expanded = true;
  }
  if (written.wordCount < acceptFloor) {
    if (input.softLengthGate && written.wordCount >= 800) {
      await input.onProgress?.(
        `${chapterLabel}: noch unter Min (${written.wordCount}/${min}) — Lauf geht weiter; später Einzelkapitel nachziehen.`,
      );
      return { ...written, chapterNumber: chapterNum, expanded };
    }
    throw new Error(
      `${chapterLabel} zu kurz (${written.wordCount} Wörter, Minimum ${min}, Band ${min}–${max}). Bitte Erzeugen erneut.`,
    );
  }
  return { ...written, chapterNumber: chapterNum, expanded };
}

/**
 * Compact research + graph facts for length expands (anecdote / dialog weave).
 */
export function buildManuskriptExpandMaterial(input: {
  editorial: RomanEditorial;
  chapterNumber: number;
}): string {
  const parts: string[] = [];
  const recherche = (input.editorial.rechercheDossier ?? "").trim();
  if (recherche.length >= 40) {
    parts.push(`## Recherche-Dossier (Ausschnitt)\n${recherche.slice(0, 4_500)}`);
  }
  const graph = formatWissensGraphForPrompt(input.editorial.wissensGraph, {
    throughChapter: input.chapterNumber,
    maxChars: 2_800,
  });
  if (graph) {
    parts.push(graph);
  }
  const facts = (input.editorial.wissensGraph?.nodes ?? [])
    .filter(
      (n) =>
        (n.kind === "fact" ||
          n.kind === "concept" ||
          n.kind === "secret" ||
          n.kind === "prop") &&
        n.sinceChapter <= input.chapterNumber,
    )
    .slice(0, 12)
    .map((n) => `- [${n.kind}] ${n.label}: ${n.summary || "—"}`)
    .join("\n");
  if (facts) {
    parts.push(`## Stoff-Kandidaten (Graph)\n${facts}`);
  }
  return parts.join("\n\n").trim();
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
  tonalitaet?: string;
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
  const graphBlock = formatWissensGraphForPrompt(input.editorial.wissensGraph, {
    maxChars: CLIP.sharedContext,
  });
  const recherche = (input.editorial.rechercheDossier ?? "").trim();
  const ton = (input.tonalitaet ?? "").trim();

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

# Hintergrundrecherche
${recherche.slice(0, CLIP.recherche) || "(keine)"}

# Sprache & Tonalität (Schreiber)
${ton.slice(0, CLIP.grob) || "(keine)"}

# Basis-Regeln
${(input.grobRegeln ?? "").trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${(input.weltSchauplaetze ?? "").trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${(input.weltRegeln ?? "").trim().slice(0, CLIP.weltRegeln) || "(leer)"}

${graphBlock ? `${graphBlock}\n` : ""}
# Kapitelgerüst
${input.szenenplot.trim().slice(0, CLIP.szenenplot) || "(leer)"}

# Manuskript (zu prüfen)
${text.slice(0, CLIP.manuskript)}

Auftrag als Entwicklungslektor:
Gegenlese dramaturgisch gegen ALLE Upstream-Artefakte und den Wissensgraphen — knallhart gegen Regeln + innere Logik/Kontinuität — mit Vorschlägen, die man direkt einbauen kann.
Fokus: Logiklöcher, Motivation, Figurenbögen, Spannungshänger, Pacing, Widersprüche zu Plot/Welt/Idee/Graph, doppelte Beats/Kapiteljobs, Vermeidung von KI-Mittelmaß.
Keine separate Marktanalyse-Bedürfnis-Pflicht.

Form:
1. Regel- & Logik-Check (Regeln / Logik / Graph-Invarianten — je erfüllt/teilweise/fehlt)
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
 * Weave critique (Lektor or Testleser) + author comment into Manuskript.
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
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
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
 * Resumes from `existingManuskript`: chapters at/above the length-gate *min*
 * are kept (no rewrite). Shorter chapters are rewritten. Persist after each
 * new chapter so a mid-book abort does not re-bill finished chapters.
 */
export async function suggestManuskriptFromLektorUndCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  /** Schreiber Sprache & Tonalität — must reach slim canon / prose. */
  tonalitaet?: string;
  stilbibel?: string;
  kiRegelwerk?: string;
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
    meta?: {
      storyState: RomanStoryState | null;
      wissensGraph?: RomanWissensGraph | null;
    },
  ) => Promise<void>;
  /** Live wait-dialog status (chapter + current sub-step). */
  onProgress?: (label: string) => Promise<void>;
  /**
   * Alles erzeugen: fewer optional LLM calls (no Path-B, one expand max,
   * no book-length expand rounds). Continuity stays on: storyState extract +
   * full-body Wissensgraph grow after each chapter (fail-soft).
   */
  leanFullBook?: boolean;
  /** Soft deadline — stop before next unpaid chapter write and auto-continue. */
  chunkBudget?: GenerateChunkBudget;
}): Promise<ManuskriptSuggestResult> {
  const report = async (label: string) => {
    await input.onProgress?.(label);
  };
  const lean = Boolean(input.leanFullBook);

  await report("Arbeitsbrief: Entwicklungslektor bereitet das Buch vor …");
  const brief = await briefManuskriptFromLektor(input);
  const total = brief.chapters.length;

  // Legacy/weak plots: Ort/Etage/Prop-Ablage nachschärfen, then freeze.
  let liveStructured: RomanSzenenplotStructured | null =
    input.editorial.szenenplotStructured ?? null;
  let frozenAtStart = false;
  let spatialEnriched = false;
  if (liveStructured && szenenplotNeedsSpatialEnrichment(liveStructured)) {
    liveStructured = await enrichSzenenplotSpatialContinuity(liveStructured, {
      onProgress: report,
    });
    spatialEnriched = true;
  }
  if (
    liveStructured &&
    liveStructured.chapters.length > 0 &&
    !hasFrozenSchreibPrompts(liveStructured)
  ) {
    liveStructured = freezeSzenenplotSchreibPrompts(liveStructured);
    frozenAtStart = true;
    await report(
      "Szenenverträge eingefroren (schreibPrompts) — slim packets für alle Kapitel …",
    );
  }
  const contractsFrozen = hasFrozenSchreibPrompts(liveStructured);
  const prevTailChars = contractsFrozen
    ? CONTINUITY_PREV_TAIL_CHARS_FROZEN
    : CONTINUITY_PREV_TAIL_CHARS;
  await report(
    lean
      ? `Schreibbrief fertig · ${total} Kapitel nacheinander (Continuity${
          contractsFrozen ? ", frozen contracts" : ""
        }) …`
      : `Schreibbrief fertig · ${total} Kapitel — unkonventionelle Beats vorbereiten …`,
  );
  const needsBlock = manuskriptNeedsPromptBlock(input.editorial);
  // Slim-Canon stays in cacheablePrefix; Bias only when contracts not frozen.
  const autorBias = contractsFrozen
    ? ""
    : formatAutorBiasFromCharaktere(input.charaktere);
  const { min: chapterMin } = manuskriptWordsPerChapter(
    brief.zielWortzahl,
    brief.chapters.length,
    brief.zielWortzahlSzeneMax,
  );
  /** Resume only when chapter already meets the same min as the length gate. */
  const resumeMinWords = chapterMin;
  const pathBByChapter = new Map<number, string>();
  // Frozen contracts already fix plot — skip Path-B micro-calls (token + drift).
  if (!lean && !contractsFrozen) {
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
  const resumedChapters: number[] = [];
  const existingByNumber = new Map(
    parsePlotChapters(input.existingManuskript ?? "").map(
      (c) => [c.number, c] as const,
    ),
  );
  let storyState: RomanStoryState | null = input.editorial.storyState ?? null;
  let liveGraph: RomanWissensGraph | null =
    input.editorial.wissensGraph ?? null;

  const resumeKeepers = brief.chapters.filter((ch) => {
    const body = scrubManuskriptChapterBody(
      existingByNumber.get(ch.number)?.body ?? "",
    );
    return manuskriptChapterWordCount(body) >= resumeMinWords;
  });
  if (resumeKeepers.length > 0) {
    await report(
      `Fortsetzen: ${resumeKeepers.length}/${total} Kapitel ≥ ${resumeMinWords} Wörter — werden nicht neu geschrieben …`,
    );
  }

  for (const chapter of brief.chapters) {
    const chapterLabel = `Kapitel ${chapter.number}/${total}${
      chapter.title?.trim() ? ` — „${chapter.title.trim()}“` : ""
    }`;
    const existingBody = scrubManuskriptChapterBody(
      existingByNumber.get(chapter.number)?.body ?? "",
    );
    const existingWords = manuskriptChapterWordCount(existingBody);

    if (existingWords >= resumeMinWords) {
      parts.push(
        formatManuskriptChapterBlock({
          ...chapter,
          body: existingBody,
        }),
      );
      resumedChapters.push(chapter.number);
      if (
        existingBody.trim().length >= 80 &&
        (storyState?.afterChapter ?? 0) < chapter.number
      ) {
        try {
          storyState = await extractManuskriptStoryState({
            previous: storyState,
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            chapterBody: existingBody,
          });
        } catch {
          /* fail-soft */
        }
      }
      await report(
        `${chapterLabel}: vorhanden (${existingWords}/${resumeMinWords} Wörter) — übersprungen`,
      );
      continue;
    }

    // Checkpoint before starting a long chapter write (resume-safe).
    try {
      input.chunkBudget?.assertCanStartUnit(chapterLabel);
    } catch (budgetErr) {
      if (isGenerateChunkContinueError(budgetErr)) {
        if (parts.length > 0 && input.onChapterWritten) {
          try {
            const partial = normalizeManuskriptDocument(
              parts.join("\n\n\n\n"),
              { requiredFromPlot: input.szenenplot },
            );
            const lastDone =
              parsePlotChapters(partial).filter((c) => c.body.trim()).at(-1)
                ?.number ?? 0;
            await input.onChapterWritten(partial, lastDone, {
              storyState,
              wissensGraph: liveGraph,
            });
          } catch {
            /* best-effort */
          }
        }
        throw new GenerateChunkContinueError(
          `Checkpoint nach ${parts.length}/${total} Kapiteln — automatische Fortsetzung …`,
          {
            chaptersDone: parts.length,
            chaptersTotal: total,
            reason: "budget",
          },
        );
      }
      throw budgetErr;
    }

    const previousMarkdown = parts.join("\n\n\n\n");
    const previousTail =
      previousMarkdown.trim().length > 80
        ? previousMarkdown.trim().slice(-prevTailChars)
        : "";

    try {
      await report(
        contractsFrozen
          ? `${chapterLabel}: Kapitel-Paket (frozen contracts) …`
          : `${chapterLabel}: Kapitel-Paket (Gemini) …`,
      );
        const writtenSoFar = parsePlotChapters(parts.join("\n\n\n\n")).filter(
          (c) => c.body.trim().length >= 80,
        );
        const chapterCacheablePrefix =
          writtenSoFar.length >= 2
            ? `${brief.cacheablePrefix}\n\n${buildCrossChapterStyleAnchor(writtenSoFar)}`.trim()
            : brief.cacheablePrefix;

        const { packet: chapterPacket } = await resolveManuskriptChapterPacket({
        storyState,
        chapter,
        allChapters: brief.chapters,
        previousTail,
        lektorBrief: brief.lektorBrief,
        wissensGraph: liveGraph,
        szenenplotStructured: liveStructured,
        pathBBlock: contractsFrozen
          ? undefined
          : pathBByChapter.get(chapter.number),
        autorBias: contractsFrozen ? undefined : autorBias,
        slimCanonSnippet: chapterCacheablePrefix,
      });

      const writeOnce = () =>
        writeManuskriptChapterWithLengthGate({
          coAutorSystem: brief.coAutorSystem,
          sharedContext: brief.sharedContext,
          cacheablePrefix: chapterCacheablePrefix,
          lektorBrief: brief.lektorBrief,
          chapter,
          allChapters: brief.chapters,
          previousChaptersMarkdown: previousMarkdown,
          existingManuskript: input.existingManuskript,
          weave: brief.weave,
          zielWortzahl: brief.zielWortzahl,
          zielWortzahlSzeneMax: brief.zielWortzahlSzeneMax,
          needsBlock,
          autorBias: contractsFrozen ? undefined : autorBias,
          pathBBlock: contractsFrozen
            ? undefined
            : pathBByChapter.get(chapter.number),
          chapterPacket,
          previousTailChars: prevTailChars,
          szenenplotStructured: liveStructured,
          wissensGraph: liveGraph,
          storyState,
          expandMaterial: buildManuskriptExpandMaterial({
            editorial: {
              ...input.editorial,
              wissensGraph: liveGraph,
              szenenplotStructured: liveStructured,
            },
            chapterNumber: chapter.number,
          }),
          progressChapterLabel: chapterLabel,
          onProgress: report,
          maxExpands: lean ? 1 : 2,
          softLengthGate: lean,
        });

      await report(`${chapterLabel}: Co-Autor schreibt …`);
      /** Keep history `at` fresh so the stale-watchdog does not kill a live write. */
      const withWriteHeartbeat = async <T>(
        work: () => Promise<T>,
        phase: string,
      ): Promise<T> => {
        let ticks = 0;
        const timer = setInterval(() => {
          ticks += 1;
          void report(
            `${chapterLabel}: ${phase} (noch aktiv · ${ticks * 3} Min.) …`,
          );
        }, 180_000);
        try {
          return await work();
        } finally {
          clearInterval(timer);
        }
      };
      let written: Awaited<ReturnType<typeof writeOnce>>;
      try {
        written = await withWriteHeartbeat(writeOnce, "Co-Autor schreibt");
      } catch (firstError) {
        if (!isAiAbortError(firstError)) throw firstError;
        await report(
          `${chapterLabel}: Timeout/Abbruch — ein erneuter Schreibversuch …`,
        );
        written = await withWriteHeartbeat(
          writeOnce,
          "Co-Autor schreibt (Retry)",
        );
      }
      if (written.expanded) expandedChapters.push(chapter.number);
      parts.push(written.chapterMarkdown);

      const body = extractManuskriptChapterBody(
        written.chapterMarkdown,
        chapter.number,
      );

      await report(`${chapterLabel}: Story-State speichern …`);
      try {
        storyState = await extractManuskriptStoryState({
          previous: storyState,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          chapterBody: body,
        });
      } catch {
        /* fail-soft */
      }

      if (liveGraph && body.trim().length >= 80) {
        try {
          await report(`${chapterLabel}: Wissensgraph aktualisieren …`);
          liveGraph = await growWissensGraphFromChapterBodies({
            previous: liveGraph,
            stage: "manuskript",
            chapters: [
              {
                number: chapter.number,
                title: chapter.title,
                body,
              },
            ],
          });
        } catch {
          /* fail-soft — next chapter still sees previous graph */
        }
      }

      const partial = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
        requiredFromPlot: input.szenenplot,
      });
      if (input.onChapterWritten) {
        await input.onChapterWritten(partial, chapter.number, {
          storyState,
          wissensGraph: liveGraph,
        });
      }
      await report(
        `${chapterLabel}: fertig (${written.wordCount} Wörter)${
          written.expanded ? " · nachgezogen" : ""
        }`,
      );
    } catch (error) {
      if (isGenerateChunkContinueError(error)) throw error;
      const detail =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      if (parts.length > 0 && input.onChapterWritten) {
        try {
          const partial = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
            requiredFromPlot: input.szenenplot,
          });
          await input.onChapterWritten(partial, chapter.number, {
            storyState,
            wissensGraph: liveGraph,
          });
        } catch {
          /* persist best-effort */
        }
      }
      const kept = parts.length;
      // Mid-book abort/timeout → auto-continue hop instead of terminal error.
      if (
        kept > 0 &&
        kept < total &&
        (isAiAbortError(error) ||
          /timeout|abbruch|abortexception|timed?\s*out/i.test(detail))
      ) {
        throw new GenerateChunkContinueError(
          `${chapterLabel}: Timeout/Abbruch — ${kept}/${total} Kapitel gespeichert. Automatische Fortsetzung …`,
          {
            chaptersDone: kept,
            chaptersTotal: total,
            reason: "abort",
          },
        );
      }
      throw new Error(
        `${chapterLabel} abgebrochen: ${detail}. ${kept} Kapitel gespeichert — „Alles erzeugen“ erneut starten setzt dort fort (fertig geschriebene Kapitel werden nicht neu bezahlt).`,
      );
    }
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
      const previousTail = previousMarkdown.trim().slice(-prevTailChars);
      const expandSoFar = parsePlotChapters(previousMarkdown).filter(
        (c) => c.body.trim().length >= 80,
      );
      const expandCacheablePrefix =
        expandSoFar.length >= 2
          ? `${brief.cacheablePrefix}\n\n${buildCrossChapterStyleAnchor(expandSoFar)}`.trim()
          : brief.cacheablePrefix;
      const { packet: chapterPacket } = await resolveManuskriptChapterPacket({
        storyState,
        chapter: item.chapter,
        allChapters: brief.chapters,
        previousTail,
        lektorBrief: brief.lektorBrief,
        wissensGraph: liveGraph,
        szenenplotStructured: liveStructured,
        autorBias: contractsFrozen ? undefined : autorBias,
        slimCanonSnippet: expandCacheablePrefix,
      });
      const written = await writeManuskriptChapter({
        coAutorSystem: brief.coAutorSystem,
        sharedContext: brief.sharedContext,
        cacheablePrefix: expandCacheablePrefix,
        lektorBrief: brief.lektorBrief,
        chapter: item.chapter,
        allChapters: brief.chapters,
        previousChaptersMarkdown: previousMarkdown,
        existingManuskript: input.existingManuskript,
        weave: brief.weave,
        zielWortzahl: brief.zielWortzahl,
        zielWortzahlSzeneMax: brief.zielWortzahlSzeneMax,
        needsBlock,
        autorBias: contractsFrozen ? undefined : autorBias,
        chapterPacket,
        previousTailChars: prevTailChars,
        szenenplotStructured: liveStructured,
        expandBody: item.body,
        expandMaterial: buildManuskriptExpandMaterial({
          editorial: {
            ...input.editorial,
            wissensGraph: liveGraph,
            szenenplotStructured: liveStructured,
          },
          chapterNumber: item.chapter.number,
        }),
      });
      const idx = brief.chapters.findIndex((c) => c.number === item.chapter.number);
      if (idx >= 0) {
        parts[idx] = written.chapterMarkdown;
        if (!expandedChapters.includes(item.chapter.number)) {
          expandedChapters.push(item.chapter.number);
        }
      }
      const body =
        extractManuskriptChapterBody(
          written.chapterMarkdown,
          item.chapter.number,
        ) || item.body;
      storyState = await extractManuskriptStoryState({
        previous: storyState,
        chapterNumber: item.chapter.number,
        chapterTitle: item.chapter.title,
        chapterBody: body,
      });
      if (liveGraph && body.trim().length >= 80) {
        try {
          liveGraph = await growWissensGraphFromChapterBodies({
            previous: liveGraph,
            stage: "manuskript",
            chapters: [
              {
                number: item.chapter.number,
                title: item.chapter.title,
                body,
              },
            ],
          });
        } catch {
          /* fail-soft */
        }
      }
      const partial = normalizeManuskriptDocument(parts.join("\n\n\n\n"), {
        requiredFromPlot: input.szenenplot,
      });
      if (input.onChapterWritten) {
        await input.onChapterWritten(partial, item.chapter.number, {
          storyState,
          wissensGraph: liveGraph,
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
    wissensGraph: liveGraph,
    szenenplotStructured:
      frozenAtStart || contractsFrozen || spatialEnriched
        ? liveStructured
        : undefined,
    wordMetrics: {
      words,
      zielWortzahl: brief.zielWortzahl,
      chaptersUnderMin,
      expandedChapters: [...expandedChapters].sort((a, b) => a - b),
      resumedChapters: [...resumedChapters].sort((a, b) => a - b),
    },
  };
}

/** Export metrics formatter for pipeline summaries. */
export { formatManuskriptWordMetrics };
