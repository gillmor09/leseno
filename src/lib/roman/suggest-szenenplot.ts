/**
 * Kapitelgerüst: structured Szenenplot (dramaturgy JSON) + markdown mirror.
 * Co-Autor generates scenes with goal/obstacle/turn/value-change + continuity.
 */

import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  exposeTextFromEditorial,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  formatChapterBlock,
  formatChapterHeading,
  parsePlotChapters,
  stripLeadingChapterHeadings,
  suggestedChapterCount,
  szenenplotBeatSheetFormHint,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  parseRomanSzenenplotStructured,
  structuredSzenenplotToMarkdown,
  SZENENPLOT_SKELETON_SCHEMA_HINT,
  SZENENPLOT_STRUCTURED_SCHEMA_HINT,
  SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";

const MARK_KAPITEL_START = "===KAPITEL===";
const MARK_KAPITEL_ENDE = "===ENDE===";

/**
 * Beat sheets + outline use Co-Autor (Claude by default).
 * Gemini often blocks mid-book fiction conflict as PROHIBITED_CONTENT —
 * same reason Co-Autor was moved off Gemini in roman_ki_rollen.
 */
const MAX_CHAPTERS = 24;
/** Chapters per scene-batch call — keeps JSON under output-token limits. */
const SCENES_BATCH_SIZE = 3;
const SKELETON_MAX_TOKENS = 4_096;
const SCENES_BATCH_MAX_TOKENS = 8_192;
const SCENES_BATCH_TIMEOUT_MS = 120_000;

export type SzenenplotOutlineResult = {
  chapters: PlotChapter[];
  outlineMarkdown: string;
  woven: boolean;
  modelLabel: string;
  sharedContext: string;
  coAutorSystem: string;
  beatModelLabel: string;
};

export type SzenenplotChapterBeatResult = {
  chapterMarkdown: string;
  chapterNumber: number;
  modelLabel: string;
};

export type SzenenplotSuggestResult = {
  szenenplot: string;
  structured: RomanSzenenplotStructured;
  woven: boolean;
  modelLabel: string;
};

export type SzenenplotCritiqueResult = {
  critique: string;
  modelLabel: string;
};

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:markdown|md|text|json)?\s*/i, "")
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

/** True when Kapitelgerüst already has substance. */
export function hasFilledSzenenplot(plot: string): boolean {
  return plot.trim().length >= 80;
}

function typHints(buchTyp: RomanBuchTyp): string {
  switch (buchTyp) {
    case "sachbuch":
      return `Sachbuch: Kapitel = Argumentblöcke; Szenen = didaktische Einheiten mit klarer Erkenntnis-/Wertänderung (kein Roman-Thriller-Zwang, aber keine leeren Wiederholungen).`;
    case "serie_welt":
      return `Serie/Welt: Szenen für DIESES Band — Kontinuität wahren, Band-Bogen tragen.`;
    default:
      return `Belletristik: dramatische Szenen mit Ziel → Hindernis → Wendepunkt → Wertänderung.`;
  }
}

function buildSharedContext(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
}): string {
  const expose = exposeTextFromEditorial(input.editorial);
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";
  const zielWort =
    input.editorial.zielWortzahlRoman != null
      ? String(input.editorial.zielWortzahlRoman)
      : "?";

  return `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Zielwortzahl (Orientierung): ${zielWort}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé (verbindliche grobe Handlung)
${expose.slice(0, CLIP.expose)}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}

${typHints(input.buchTyp)}`;
}

type SkeletonChapter = {
  number: number;
  title: string;
  kernsatz: string;
};

function parseSkeletonChapters(raw: string): SkeletonChapter[] {
  const obj = parseModelJsonObject(raw, "Szenenplot-Gerüst");
  const list = Array.isArray(obj.chapters) ? obj.chapters : [];
  const out: SkeletonChapter[] = [];
  for (const item of list.slice(0, MAX_CHAPTERS)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const number = Number(c.number ?? c.kapitel ?? c.n);
    if (!Number.isFinite(number) || number < 1) continue;
    const title = String(c.title ?? c.titel ?? "")
      .trim()
      .slice(0, 120);
    const kernsatz = String(c.kernsatz ?? c.summary ?? c.role ?? "")
      .trim()
      .slice(0, 400);
    if (kernsatz.length < 8 && title.length < 2) continue;
    out.push({
      number: Math.min(40, Math.round(number)),
      title: title || `Kapitel ${Math.round(number)}`,
      kernsatz: kernsatz || "Kapitel-Funktion klären.",
    });
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

function renumberSceneIds(
  chapters: RomanSzenenplotChapterNode[],
): RomanSzenenplotChapterNode[] {
  let n = 0;
  return chapters.map((ch) => ({
    ...ch,
    scenes: ch.scenes.map((s) => {
      n += 1;
      return {
        ...s,
        scene_id: `SZ_${String(n).padStart(2, "0")}`,
      };
    }),
  }));
}

/**
 * Co-Autor: structured Szenenplot in two passes (skeleton → scene batches).
 * One-shot full-book JSON often truncates mid-object → parse failures.
 */
export async function suggestSzenenplotFromCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  existingPlot: string;
}): Promise<SzenenplotSuggestResult> {
  const expose = exposeTextFromEditorial(input.editorial);
  const hasSpec =
    expose.length >= 80 ||
    (input.ideeKurz.trim().length >= 40 &&
      formatCharaktere(input.charaktere).trim().length >= 40);
  if (!hasSpec) {
    throw new Error(
      "Zuerst einen Spec anlegen (Idee + Figuren/Welt/Exposé unter „Spec“).",
    );
  }

  const weave = hasFilledSzenenplot(input.existingPlot);
  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const kapitelZiel = suggestedChapterCount(input.editorial.zielWortzahlRoman);
  const sharedContext = buildSharedContext(input);
  const systemBase = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM}`;

  const weaveBlock = weave
    ? `Bestehenden Plot VERWEBEN/SCHÄRFEN — brauchbare Kapitel behalten, Lücken schließen, Widersprüche zum Exposé auflösen.`
    : `Szenenplot NEU aus Exposé, Idee, Figuren und Welt.`;

  // Pass 1: chapter skeleton only (small JSON — reliable).
  const skeletonRaw = await generateText({
    model,
    systemInstruction: systemBase,
    userText: `${sharedContext}

# Bisheriger Plot (Orientierung)
${weave ? input.existingPlot.trim().slice(0, CLIP.szenenplot) : "(leer — neu anlegen)"}

${weaveBlock}

Auftrag Pass 1 — nur Kapitelgerüst (Titel + Kernsatz), KEINE Szenen:
- Ca. ${kapitelZiel} Kapitel (mind. ${Math.max(4, kapitelZiel - 2)}, max. ${Math.min(MAX_CHAPTERS, kapitelZiel + 2)}).
- Chronologisch, Exposé-Bogen abdecken.
- Auf Deutsch.

Schema:
${SZENENPLOT_SKELETON_SCHEMA_HINT}

Nur JSON.`,
    preferJson: true,
    maxTokens: SKELETON_MAX_TOKENS,
    timeoutMs: 90_000,
  });

  const skeleton = parseSkeletonChapters(skeletonRaw);
  if (skeleton.length < 2) {
    throw new Error(
      "Szenenplot-Gerüst: zu wenige Kapitel. Bitte erneut versuchen.",
    );
  }

  // Pass 2: scenes in small batches so JSON stays under output limits.
  const filled: RomanSzenenplotChapterNode[] = [];
  let prevHook = "";

  for (let i = 0; i < skeleton.length; i += SCENES_BATCH_SIZE) {
    const batch = skeleton.slice(i, i + SCENES_BATCH_SIZE);
    const batchNums = batch.map((c) => c.number).join(", ");
    const outlineBlock = skeleton
      .map(
        (c) =>
          `- Kap. ${c.number} — ${c.title}: ${c.kernsatz}${
            batch.some((b) => b.number === c.number) ? " ← DIESES BATCH" : ""
          }`,
      )
      .join("\n");

    const batchRaw = await generateText({
      model,
      systemInstruction: systemBase,
      userText: `${sharedContext}

# Gesamtes Kapitelgerüst (Orientierung)
${outlineBlock}

${
  prevHook
    ? `# Hook aus vorheriger Szene (nahtlos fortsetzen)\n${prevHook}\n`
    : ""
}
# Dieser Batch — Kapitel ${batchNums}
Schreibe NUR diese Kapitel mit vollständigen Szenen (typisch 2–5 pro Kapitel).
Jede Szene: dramaturgy (inkl. outcome_value_change), information_flow, continuity.
scene_id fortlaufend SZ_01… innerhalb des Batches ok (werden später normalisiert).
Auf Deutsch. Felder kurz (1–2 Sätze).

Schema (nur die Kapitel dieses Batches in chapters[]):
${SZENENPLOT_STRUCTURED_SCHEMA_HINT}

Nur JSON.`,
      preferJson: true,
      maxTokens: SCENES_BATCH_MAX_TOKENS,
      timeoutMs: SCENES_BATCH_TIMEOUT_MS,
    });

    let batchParsed: RomanSzenenplotStructured | null = null;
    try {
      const obj = parseModelJsonObject(batchRaw, "Szenenplot-Batch");
      batchParsed = parseRomanSzenenplotStructured(obj, {
        modelLabel: model.label,
        minChapters: 1,
        minScenes: 1,
      });
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Szenenplot-Batch lieferte kein gültiges JSON.");
    }
    if (!batchParsed) {
      throw new Error(
        `Szenenplot-Batch Kap. ${batchNums}: JSON unvollständig (Szenen mit dramaturgy nötig).`,
      );
    }

    for (const sk of batch) {
      const found =
        batchParsed.chapters.find((c) => c.number === sk.number) ??
        batchParsed.chapters.find(
          (c) =>
            c.title.toLowerCase() === sk.title.toLowerCase() &&
            !filled.some((f) => f.number === c.number),
        );
      if (!found || found.scenes.length < 1) {
        throw new Error(
          `Szenenplot Kap. ${sk.number} („${sk.title}“) ohne gültige Szenen. Bitte erneut versuchen.`,
        );
      }
      filled.push({
        number: sk.number,
        title: sk.title,
        kernsatz: sk.kernsatz,
        scenes: found.scenes,
      });
      const last = found.scenes[found.scenes.length - 1];
      prevHook = last?.continuity.next_scene_hook?.trim() || prevHook;
    }
  }

  if (filled.length < 2) {
    throw new Error(
      "Co-Autor lieferte zu wenige Kapitel im Szenenplot. Bitte erneut versuchen.",
    );
  }

  const structured: RomanSzenenplotStructured = {
    updatedAt: new Date().toISOString(),
    modelLabel: model.label,
    chapters: renumberSceneIds(filled),
  };
  const markdown = structuredSzenenplotToMarkdown(structured);

  return {
    szenenplot: markdown,
    structured,
    woven: weave,
    modelLabel: model.label,
  };
}

/**
 * Co-Autor: structured plot as outline result (legacy shape for callers).
 */
export async function outlineSzenenplotFromCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  existingPlot: string;
}): Promise<SzenenplotOutlineResult> {
  const data = await suggestSzenenplotFromCoAutor(input);
  const chapters = parsePlotChapters(data.szenenplot).slice(0, MAX_CHAPTERS);
  const { rolle } = await resolveRomanKiRolle("co_autor");
  return {
    chapters,
    outlineMarkdown: data.szenenplot,
    woven: data.woven,
    modelLabel: data.modelLabel,
    sharedContext: buildSharedContext(input),
    coAutorSystem: rolle.systemPrompt,
    beatModelLabel: data.modelLabel,
  };
}

/**
 * Co-Autor fills one chapter beat sheet — short, complete response.
 */
export async function writeSzenenplotChapterBeat(input: {
  coAutorSystem: string;
  sharedContext: string;
  chapter: PlotChapter;
  allChapters: PlotChapter[];
  previousBeatsMarkdown: string;
  existingPlot: string;
  weave: boolean;
}): Promise<SzenenplotChapterBeatResult> {
  const { model } = await resolveRomanKiRolle("co_autor");
  const chapter = input.chapter;
  const slimContext = input.sharedContext.slice(0, CLIP.sharedContext);
  const index = input.allChapters
    .map((c) => `- ${formatChapterHeading(c)}`)
    .join("\n");
  const prev =
    input.previousBeatsMarkdown.trim().length > 40
      ? input.previousBeatsMarkdown.trim().slice(-CLIP.szenenplot)
      : "(noch keine Beats)";

  const userText = `${slimContext}

# Kapitelübersicht (verbindlich)
${index}

# Bisher ausgearbeitete Beats (Auszug, neueste zuerst am Ende)
${prev}

# Alttext zu diesem Kapitel (falls Verweben)
${
  input.weave
    ? (
        parsePlotChapters(input.existingPlot).find(
          (c) => c.number === chapter.number,
        )?.body ?? "(kein Alttext)"
      ).slice(0, CLIP.chapterBody)
    : "(leer)"
}

# Dieses Kapitel ausarbeiten
Outline-Kern:
${chapter.body.slice(0, CLIP.chapterBody) || "(nur Titel)"}

Auftrag — NUR Beat-Sheet-Stichpunkte für Kapitel ${chapter.number} („${chapter.title}“).
KEINE Überschrift „## Kapitel …“ schreiben — die setzt das System.
${szenenplotBeatSheetFormHint(chapter.number)}

Antworte EXAKT:
${MARK_KAPITEL_START}
(Szenen-Überschriften + Stichpunkte, keine Kapitel-Überschrift)
${MARK_KAPITEL_ENDE}`;

  const raw = await generateText({
    model,
    systemInstruction: `${input.coAutorSystem}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Kapitel-Beats:
Nur Stichpunkte für EIN Kapitel. ${MARK_KAPITEL_START} … ${MARK_KAPITEL_ENDE}.`,
    userText,
    preferJson: false,
    maxTokens: 3_500,
    timeoutMs: 90_000,
  });

  const text = stripFence(raw);
  const marked = extractBetween(text, MARK_KAPITEL_START, MARK_KAPITEL_ENDE);
  const body = stripLeadingChapterHeadings(
    marked || text,
    input.chapter.number,
  );

  if (body.length < 40) {
    throw new Error(
      `Co-Autor lieferte kein brauchbares Kapitel ${input.chapter.number}.`,
    );
  }

  return {
    chapterMarkdown: formatChapterBlock({ ...input.chapter, body }),
    chapterNumber: input.chapter.number,
    modelLabel: model.label,
  };
}

/**
 * Entwicklungslektor critiques the Kapitelgerüst.
 */
export async function critiqueSzenenplotMitEntwicklungslektor(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  expose: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenplot: string;
  editorial: RomanEditorial;
  title?: string;
  genre?: string;
}): Promise<SzenenplotCritiqueResult> {
  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);
  const shared = buildSharedContext({
    buchTyp: input.buchTyp,
    title: input.title ?? "",
    genre: input.genre ?? "",
    ideeKurz: input.ideeKurz,
    grobRegeln: input.grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
  });

  const userText = `${compliance}

${shared}

# Exposé (Kurz)
${input.expose.trim().slice(0, CLIP.expose) || "(leer)"}

# Kapitelgerüst / Szenenplot
${input.szenenplot.trim().slice(0, CLIP.szenenplot)}

Auftrag — knallharte Gegenlese:
- Logik der Kapitelkette und Szenen (Ursache/Wirkung, Hooks).
- Dramaturgie: Ziel/Hindernis/Wendepunkt/Wertänderung pro Szene.
- Informationsfluss und Kontinuität.
- Abdeckung des Exposés; keine Füllszenen.
Struktur: Stärken → Risiken → max. 5 konkrete Nacharbeitspunkte (imperativ, mit Kap./Szene).

${ROMAN_CRITIQUE_MANDATE}`;

  const critique = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

Zusatzauftrag Kapitelgerüst-Gegenlese: entwicklungslektorisch, konkret, auf Deutsch.`,
      userText,
      preferJson: false,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 90_000,
    })
  ).trim();

  if (critique.length < 80) {
    throw new Error("Entwicklungslektor lieferte keine brauchbare Kritik.");
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: model.label };
}

/**
 * Weave Lektor critique into one chapter beat (client loops chapters).
 */
export async function weaveSzenenplotChapterFromLektorKritik(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  expose: string;
  chapter: PlotChapter;
  allChaptersMarkdown: string;
  critique: string;
  authorComment: string;
}): Promise<SzenenplotChapterBeatResult> {
  const critique = input.critique.trim();
  if (critique.length < 40) {
    throw new Error("Lektor-Kritik fehlt.");
  }

  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const { comment, hasExplicitComment } = resolveAuthorWeaveComment(
    input.authorComment,
  );
  const heading = formatChapterHeading(input.chapter);

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Kommentar der Autor:in zur Übernahme (verbindliche Leitplanke)
${comment}

${buildCommentedWeaveRules({ kind: "szenenplot", hasExplicitComment })}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Exposé
${input.expose.trim().slice(0, CLIP.expose) || "(leer)"}

# Gesamter Szenenplot (Kontext)
${input.allChaptersMarkdown.slice(0, CLIP.szenenplot)}

# Entwicklungslektor-Kritik
${critique.slice(0, CLIP.critique)}

# Dieses Kapitel neu schreiben
${heading}
${input.chapter.body.slice(0, CLIP.chapterBody)}

Auftrag:
Schreibe NUR die Stichpunkte für dieses Kapitel neu (gemäß Entscheidungsregeln).
KEINE Überschrift „## Kapitel …“ — die setzt das System.
Behalte oder stelle eine klare Szenengliederung her:
${szenenplotBeatSheetFormHint(input.chapter.number)}

Antworte EXAKT:
${MARK_KAPITEL_START}
(Szenen-Überschriften + Stichpunkte)
${MARK_KAPITEL_ENDE}`;

  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${buildWeaveSystemAddendum({
  kind: "szenenplot",
  outputFormatHint: `${MARK_KAPITEL_START} … ${MARK_KAPITEL_ENDE} (ein Kapitel mit ### Szene-Überschriften).`,
})}`,
    userText,
    preferJson: false,
    maxTokens: 3_500,
    timeoutMs: 90_000,
  });

  const text = stripFence(raw);
  const marked = extractBetween(text, MARK_KAPITEL_START, MARK_KAPITEL_ENDE);
  const body = stripLeadingChapterHeadings(
    marked || text,
    input.chapter.number,
  );

  if (body.length < 40) {
    throw new Error(
      `Co-Autor lieferte kein brauchbares Kapitel ${input.chapter.number}.`,
    );
  }

  return {
    chapterMarkdown: formatChapterBlock({ ...input.chapter, body }),
    chapterNumber: input.chapter.number,
    modelLabel: model.label,
  };
}
