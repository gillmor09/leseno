/**
 * Legacy combined Pass-1+2 Szenenplot (still used by outline helpers).
 * Role: Entwicklungslektor (analytical). Preferred path:
 * `suggest-kapitelgeruest.ts` then `suggest-szenenplot-detail.ts`.
 */

import { AI_LONG_PROSE_TIMEOUT_MS } from "@/lib/ai/fetch-timeout";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { generateText } from "@/lib/ai/provider";
import type { AiModelConfig } from "@/lib/prompts/catalog";
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
  ROMAN_PROSE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  parseCentralArcs,
  parseChapterPlan,
  parseRomanSzenenplotStructured,
  structuredSzenenplotToMarkdown,
  SZENENPLOT_SKELETON_SCHEMA_HINT,
  SZENENPLOT_STRUCTURED_SCHEMA_HINT,
  SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM,
  type RomanSzenenplotCentralArc,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";
import { buildRomanStaticBookPrefix } from "@/lib/roman/prompt-prefix";
import {
  closeWissensGraphGaps,
  formatWissensGraphForPrompt,
  growWissensGraphFromSkeleton,
  growWissensGraphFromSzenenBatch,
  seedWissensGraphFromSources,
} from "@/lib/roman/wissens-graph";
import type { RomanWissensGraph } from "@/lib/roman/editorial";

const MARK_KAPITEL_START = "===KAPITEL===";
const MARK_KAPITEL_ENDE = "===ENDE===";

/**
 * Beat sheets + outline use Entwicklungslektor (analytical Flash).
 * Manuskript prose stays on co_autor (expensive model).
 */
const MAX_CHAPTERS = 24;
/** Chapters per scene-batch call — keeps JSON under output-token limits. */
const SCENES_BATCH_SIZE = 3;
const SKELETON_MAX_TOKENS = 12_000;
const SCENES_BATCH_MAX_TOKENS = ROMAN_PROSE_MAX_TOKENS;
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
  /** Knowledge graph seeded + grown during this Erzeugen run. */
  wissensGraph: RomanWissensGraph | null;
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
    case "clever_erzaehlt":
      return `Clever erzählt: Kapitel = Kurzgeschichten; jede Szene/Geschichte braucht Ziel → Hindernis → Wendepunkt und einen klaren Lernpunkt aus dem Wissensgebiet.`;
    case "serie_welt":
      return `Serie/Welt: Szenen für DIESES Band — Kontinuität wahren, Band-Bogen tragen.`;
    default:
      return `Belletristik: dramatische Szenen mit Ziel → Hindernis → Wendepunkt → Wertänderung.`;
  }
}

/** Stable book bible for prompt-caching (no live graph / chapter deltas). */
function buildStaticBookPrefix(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  rechercheDossier?: string;
  tonalitaet?: string;
}): string {
  return `${buildRomanStaticBookPrefix({
    buchTyp: input.buchTyp,
    title: input.title,
    genre: input.genre,
    ideeKurz: input.ideeKurz,
    rechercheDossier: input.rechercheDossier,
    tonalitaet: input.tonalitaet,
    grobRegeln: input.grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
  })}

${typHints(input.buchTyp)}`;
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
  /** Background research dossier (Idee → Spec). */
  rechercheDossier?: string;
  /** Explicit Schreiber Sprache & Tonalität. */
  tonalitaet?: string;
  /** Optional knowledge-graph block for continuity. */
  wissensGraphBlock?: string;
}): string {
  const prefix = buildStaticBookPrefix(input);
  const graph = input.wissensGraphBlock?.trim() ?? "";
  return graph ? `${prefix}\n\n${graph}` : prefix;
}

type SkeletonChapter = {
  number: number;
  title: string;
  kernsatz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  mustNotRepeat: string[];
  introduces: string[];
  resolves: string[];
  arcBeats: ReturnType<typeof parseChapterPlan>["arcBeats"];
};

async function parseSkeletonPayload(
  raw: string,
  model: AiModelConfig,
): Promise<{
  chapters: SkeletonChapter[];
  centralArcs: RomanSzenenplotCentralArc[];
}> {
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: SZENENPLOT_SKELETON_SCHEMA_HINT,
    errorLabel: "Szenenplot-Gerüst",
    timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
    maxTokens: SKELETON_MAX_TOKENS,
  });
  const centralArcs = parseCentralArcs(
    obj.centralArcs ?? obj.central_arcs ?? obj.arcs,
  );
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
    const plan = parseChapterPlan(c);
    out.push({
      number: Math.min(40, Math.round(number)),
      title: title || `Kapitel ${Math.round(number)}`,
      kernsatz: kernsatz || "Kapitel-Funktion klären.",
      ...plan,
    });
  }
  out.sort((a, b) => a.number - b.number);
  return { chapters: out, centralArcs };
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
 * Entwicklungslektor: structured Szenenplot in two passes (skeleton → scene batches).
 * Seeds + grows knowledge graph (Idee/Recherche/Spec/Ton) so Gerüst has no gaps.
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
  /** Explicit Schreiber Sprache & Tonalität from Basics. */
  tonalitaet?: string;
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
  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const kapitelZiel = suggestedChapterCount(input.editorial.zielWortzahlRoman);
  const rechercheDossier = input.editorial.rechercheDossier ?? "";
  const tonalitaet = (input.tonalitaet ?? "").trim();

  // Seed knowledge graph before skeleton so batches already see invariants.
  let wissensGraph = await seedWissensGraphFromSources({
    buchTyp: input.buchTyp,
    title: input.title,
    genre: input.genre,
    ideeKurz: input.ideeKurz,
    rechercheDossier,
    tonalitaet,
    grobRegeln: input.grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
  });

  const staticPrefix = buildStaticBookPrefix({
    ...input,
    rechercheDossier,
    tonalitaet,
  });
  const systemBase = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM}

Zusatz: Wissensgraph und Recherche/Tonalität sind verbindlich — keine Lücken, keine Widersprüche zu hardInvariants.`;

  const weaveBlock = weave
    ? `Bestehenden Plot VERWEBEN/SCHÄRFEN — brauchbare Kapitel behalten, Lücken schließen, Widersprüche zum Exposé auflösen.`
    : `Szenenplot NEU aus Exposé, Idee, Recherche, Figuren und Welt.`;

  // Pass 1: chapter skeleton only (small JSON — reliable).
  // cacheablePrefix stays byte-identical across skeleton + all scene batches.
  const skeletonRaw = await generateText({
    model,
    systemInstruction: systemBase,
    cacheablePrefix: staticPrefix,
    userText: `${formatWissensGraphForPrompt(wissensGraph, {
      maxChars: CLIP.sharedContext,
    })}

# Bisheriger Plot (Orientierung)
${weave ? input.existingPlot.trim().slice(0, CLIP.szenenplot) : "(leer — neu anlegen)"}

${weaveBlock}

Auftrag Pass 1 — Kapitelgerüst MIT Prop-/Event-Lebenszyklus UND Spannungsbögen, KEINE Szenen:
- Ca. ${kapitelZiel} Kapitel (mind. ${Math.max(4, kapitelZiel - 2)}, max. ${Math.min(MAX_CHAPTERS, kapitelZiel + 2)}).
- Chronologisch, Exposé-Bogen abdecken.
- centralArcs (1–3, PFLICHT): zentrale Konflikte/Beziehungen (z. B. Vater–Sohn, Rivalität, Geheimnis) mit setupChapter / peakChapter / payoffChapter und parties.
- Pro Kapitel: props, events, openThreads, mustNotRepeat, introduces, resolves, arcBeats.
- arcBeats: für jeden aktiven Arc in diesem Kapitel tension 1–5, mustShow (was sichtbar wird), delta (wie sich der Bogen bewegt). Peak-/Payoff-Kapitel müssen die höchste Spannung bzw. die Auflösung tragen.
- Jedes zentrale Prop/Event (Verträge, Geräte, Beweise, Schlüsselorte) genau EINMAL in introduces planen — später nur referenzieren.
- resolves nur bei echtem Abschluss; mustNotRepeat für bereits erledigte Beats in Folgekapiteln setzen.
- Wissensgraph/Recherche-Fakten und Tonalität in Kapitel-Funktionen spiegeln.
- Auf Deutsch.

Schema:
${SZENENPLOT_SKELETON_SCHEMA_HINT}

Nur JSON.`,
    preferJson: true,
    maxTokens: SKELETON_MAX_TOKENS,
    timeoutMs: 90_000,
  });

  const { chapters: skeleton, centralArcs } = await parseSkeletonPayload(
    skeletonRaw,
    model,
  );
  if (skeleton.length < 2) {
    throw new Error(
      "Szenenplot-Gerüst: zu wenige Kapitel. Bitte erneut versuchen.",
    );
  }

  try {
    wissensGraph = await growWissensGraphFromSkeleton({
      previous: wissensGraph,
      skeleton,
    });
  } catch {
    // Fail-soft: Pass 2 still has seed graph.
  }

  // Pass 2: scenes in small batches so JSON stays under output limits.
  const filled: RomanSzenenplotChapterNode[] = [];
  let prevHook = "";

  for (let i = 0; i < skeleton.length; i += SCENES_BATCH_SIZE) {
    const batch = skeleton.slice(i, i + SCENES_BATCH_SIZE);
    const batchNums = batch.map((c) => c.number).join(", ");
    const outlineBlock = skeleton
      .map((c) => {
        const planBits = [
          c.props.length ? `props=${c.props.join(", ")}` : "",
          c.introduces.length ? `neu=${c.introduces.join(", ")}` : "",
          c.resolves.length ? `zu=${c.resolves.join(", ")}` : "",
          c.arcBeats.length
            ? `arcs=${c.arcBeats
                .map((b) => `${b.arcId}@T${b.tension}:${b.mustShow}`)
                .join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("; ");
        return `- Kap. ${c.number} — ${c.title}: ${c.kernsatz}${
          planBits ? ` [${planBits}]` : ""
        }${batch.some((b) => b.number === c.number) ? " ← DIESES BATCH" : ""}`;
      })
      .join("\n");

    const arcsHint = centralArcs.length
      ? `# Zentrale Spannungsbögen (beibehalten, in Szenen spiegeln)
${centralArcs
  .map(
    (a) =>
      `- ${a.id}: ${a.label} | Setup Kap.${a.setupChapter} · Peak Kap.${a.peakChapter} · Payoff Kap.${a.payoffChapter}`,
  )
  .join("\n")}
`
      : "";

    const liveGraphBlock = formatWissensGraphForPrompt(wissensGraph, {
      maxChars: CLIP.sharedContext,
    });

    const batchRaw = await generateText({
      model,
      systemInstruction: systemBase,
      cacheablePrefix: staticPrefix,
      userText: `${liveGraphBlock ? `${liveGraphBlock}\n` : ""}${arcsHint}
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
Continuity muss Wissensgraph fortschreiben (character_states_after mit Ort/Etage, prop_placements_after, next_scene_hook).
Gerüst-Plan (props/events/introduces/resolves/arcBeats) aus dem Outline übernehmen und in Szenen umsetzen — keine Doppel-Einführung; Arc-mustShow in dramaturgy/Wertänderung spiegeln.
KONKRET: Farben, Kennzeichen, Hausnummern, Adressen, Uhrzeiten, Daten, Namen in Summary/schreibPrompt/props festhalten (kanonisch für Wissensgraph/Manuskript).
Auf Deutsch. Felder kurz (1–2 Sätze).

Schema (nur die Kapitel dieses Batches in chapters[]; centralArcs weglassen):
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

    const batchFilled: RomanSzenenplotChapterNode[] = [];
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
      // Pass-1 lifecycle + arcs win; batch may enrich empty fields.
      const node: RomanSzenenplotChapterNode = {
        number: sk.number,
        title: sk.title,
        kernsatz: sk.kernsatz,
        props: sk.props.length ? sk.props : found.props,
        events: sk.events.length ? sk.events : found.events,
        openThreads: sk.openThreads.length
          ? sk.openThreads
          : found.openThreads,
        mustNotRepeat: sk.mustNotRepeat.length
          ? sk.mustNotRepeat
          : found.mustNotRepeat,
        introduces: sk.introduces.length ? sk.introduces : found.introduces,
        resolves: sk.resolves.length ? sk.resolves : found.resolves,
        arcBeats: sk.arcBeats.length ? sk.arcBeats : found.arcBeats,
        scenes: found.scenes,
      };
      filled.push(node);
      batchFilled.push(node);
      const last = found.scenes[found.scenes.length - 1];
      prevHook = last?.continuity.next_scene_hook?.trim() || prevHook;
    }

    try {
      wissensGraph = await growWissensGraphFromSzenenBatch({
        previous: wissensGraph,
        batchChapters: batchFilled,
        skeletonOutline: outlineBlock,
      });
    } catch {
      // Fail-soft: keep previous graph if grow call fails.
    }
  }

  if (filled.length < 2) {
    throw new Error(
      "Entwicklungslektor lieferte zu wenige Kapitel im Szenenplot. Bitte erneut versuchen.",
    );
  }

  const structured: RomanSzenenplotStructured = {
    updatedAt: new Date().toISOString(),
    modelLabel: model.label,
    centralArcs,
    chapters: renumberSceneIds(filled),
  };
  const markdown = structuredSzenenplotToMarkdown(structured);

  try {
    wissensGraph = await closeWissensGraphGaps({
      graph: wissensGraph,
      structured,
      ideeKurz: input.ideeKurz,
      rechercheDossier,
      tonalitaet,
    });
  } catch {
    // Fail-soft: keep grown graph.
  }

  return {
    szenenplot: markdown,
    structured,
    woven: weave,
    modelLabel: model.label,
    wissensGraph,
  };
}

/**
 * Entwicklungslektor: structured plot as outline result (legacy shape for callers).
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
  const { rolle } = await resolveRomanKiRolle("entwicklungslektor");
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
 * Entwicklungslektor fills one chapter beat sheet — short, complete response.
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
  const { model } = await resolveRomanKiRolle("entwicklungslektor");
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
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
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
      `Entwicklungslektor lieferte kein brauchbares Kapitel ${input.chapter.number}.`,
    );
  }

  return {
    chapterMarkdown: formatChapterBlock({ ...input.chapter, body }),
    chapterNumber: input.chapter.number,
    modelLabel: model.label,
  };
}

/**
 * Entwicklungslektor critiques the Kapitelgerüst / Szenenplot.
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
  tonalitaet?: string;
}): Promise<SzenenplotCritiqueResult> {
  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);
  const staticPrefix = buildStaticBookPrefix({
    buchTyp: input.buchTyp,
    title: input.title ?? "",
    genre: input.genre ?? "",
    ideeKurz: input.ideeKurz,
    grobRegeln: input.grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
    rechercheDossier: input.editorial.rechercheDossier ?? "",
    tonalitaet: input.tonalitaet ?? "",
  });
  const graphBlock = formatWissensGraphForPrompt(input.editorial.wissensGraph, {
    maxChars: CLIP.sharedContext,
  });

  const critique = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

Zusatzauftrag Kapitelgerüst-Gegenlese: entwicklungslektorisch, konkret, auf Deutsch.`,
      cacheablePrefix: staticPrefix,
      userText: `${compliance}

${graphBlock}

# Exposé (Kurz)
${input.expose.trim().slice(0, CLIP.expose) || "(leer)"}

# Kapitelgerüst / Szenenplot
${input.szenenplot.trim().slice(0, CLIP.szenenplot)}

Auftrag — knallharte Gegenlese:
- Logik der Kapitelkette und Szenen (Ursache/Wirkung, Hooks).
- Dramaturgie: Ziel/Hindernis/Wendepunkt/Wertänderung pro Szene.
- Spannungsbögen: Sind zentrale Arcs (centralArcs / Arc-Beats im Markdown) gesetzt? Tragen Peak-/Payoff-Kapitel die höchste Spannung bzw. Auflösung? Fehlen Beziehungsbögen aus Exposé/Figuren?
- Informationsfluss und Kontinuität; Abgleich mit Wissensgraph/Invarianten.
- Keine doppelten Kapitel-/Beat-Funktionen (z. B. zwei Auflösungskapitel mit demselben Job).
- Abdeckung des Exposés; keine Füllszenen.
Struktur: Stärken → Risiken → max. 5 konkrete Nacharbeitspunkte (imperativ, mit Kap./Szene).

${ROMAN_CRITIQUE_MANDATE}`,
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

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
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
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
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
      `Entwicklungslektor lieferte kein brauchbares Kapitel ${input.chapter.number}.`,
    );
  }

  return {
    chapterMarkdown: formatChapterBlock({ ...input.chapter, body }),
    chapterNumber: input.chapter.number,
    modelLabel: model.label,
  };
}
