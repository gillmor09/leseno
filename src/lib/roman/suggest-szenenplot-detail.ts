/**
 * Pass-2 detaillierter Szenenplot from freigegebenem Kapitelgerüst.
 * Role: Entwicklungslektor (analytical contracts + schreibPrompt for Co-Autor).
 * Grows Wissensgraph per batch; persists via `onPartial` so timeouts resume.
 */

import { isAiAbortError } from "@/lib/ai/fetch-timeout";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  exposeTextFromEditorial,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  CLIP,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_EXCELLENCE_MANDATE,
  ROMAN_PROSE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import { buildRomanStaticBookPrefix } from "@/lib/roman/prompt-prefix";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  ensureSchreibPrompts,
  geruestToSkeletonChapters,
  parseRomanSzenenplotStructured,
  structuredSzenenplotToMarkdown,
  SZENENPLOT_STRUCTURED_SCHEMA_HINT,
  SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM,
  type RomanKapitelGeruestStructured,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  closeWissensGraphGaps,
  formatWissensGraphForPrompt,
  growWissensGraphFromSzenenBatch,
} from "@/lib/roman/wissens-graph";

/** Two chapters per call — three + fat Gerüst prompts often hit the 120s wall. */
const SCENES_BATCH_SIZE = 2;
const SCENES_BATCH_MAX_TOKENS = ROMAN_PROSE_MAX_TOKENS;
const SCENES_BATCH_TIMEOUT_MS = 180_000;
/** Keep outline lean — oversized Gerüst inhaltKurz must not dominate every batch. */
const OUTLINE_INHALT_CHARS = 120;

function hasFilledPlot(plot: string): boolean {
  return plot.trim().length >= 80;
}

function chapterHasScenes(ch: RomanSzenenplotChapterNode | undefined): boolean {
  return Boolean(ch && ch.scenes.length >= 1);
}

export type SzenenplotDetailSuggestResult = {
  szenenplot: string;
  structured: RomanSzenenplotStructured;
  woven: boolean;
  modelLabel: string;
  wissensGraph: RomanWissensGraph | null;
  /** Chapters reused from a previous partial run. */
  resumedChapters: number[];
};

export type SzenenplotDetailPartialPhase = "batch" | "final";

export type SzenenplotDetailPartialPayload = {
  structured: RomanSzenenplotStructured;
  szenenplot: string;
  wissensGraph: RomanWissensGraph | null;
  phase: SzenenplotDetailPartialPhase;
  /** Highest chapter number completed in this emit (batch end). */
  chapterNumber?: number;
};

export type SzenenplotDetailCritiqueResult = {
  critique: string;
  modelLabel: string;
};

function typHints(buchTyp: RomanBuchTyp): string {
  switch (buchTyp) {
    case "sachbuch":
      return `Sachbuch: Szenen = didaktische Einheiten mit klarer Erkenntnis-/Wertänderung.`;
    case "serie_welt":
      return `Serie/Welt: Szenen für DIESES Band — Kontinuität wahren.`;
    default:
      return `Belletristik: dramatische Szenen mit Ziel → Hindernis → Wendepunkt → Wertänderung.`;
  }
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Entwicklungslektor: Pass-2 Szenen from freigegebenem Gerüst + graph grow + schreibPrompts.
 * Callers should persist via `onPartial` so aborts keep finished batches; re-run resumes.
 */
export async function suggestSzenenplotDetailFromCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  geruest: RomanKapitelGeruestStructured;
  existingPlot: string;
  tonalitaet?: string;
  /**
   * `skeleton` = Grobplot (scene heads only).
   * `full` = Feinplot (contracts + schreibPrompt).
   */
  mode?: "skeleton" | "full";
  onProgress?: (label: string) => Promise<void>;
  onPartial?: (payload: SzenenplotDetailPartialPayload) => Promise<void>;
}): Promise<SzenenplotDetailSuggestResult> {
  if (!input.geruest.chapters.length) {
    throw new Error(
      "Zuerst ein Feingerüst erzeugen und freigeben (Tab „Feingerüst“).",
    );
  }

  const mode = input.mode ?? "full";
  const skeletonOnly = mode === "skeleton";
  const weave = hasFilledPlot(input.existingPlot);
  const { rolle, model } = await resolveRomanKiRolle("schreib_coach");
  const rechercheDossier = input.editorial.rechercheDossier ?? "";
  const tonalitaet = (input.tonalitaet ?? "").trim();

  let wissensGraph = input.editorial.wissensGraph ?? null;

  const staticPrefix = buildStaticBookPrefix({
    ...input,
    rechercheDossier,
    tonalitaet,
  });
  const systemBase = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM}

Zusatz: Nur Gerüst-Kapitel ausarbeiten. ${
    skeletonOnly
      ? "GROBPLOT: nur Szenen-Köpfe (scene_id, heading, summary, characters_present) — noch KEINE vollen Verträge/schreibPrompt."
      : "FEINPLOT: schreibPrompt pro Szene ist Pflicht (Auftrag an den späteren Co-Autor)."
  }`;

  const skeleton = geruestToSkeletonChapters(input.geruest);
  const centralArcs = input.geruest.centralArcs;
  const filled: RomanSzenenplotChapterNode[] = [];
  const resumedChapters: number[] = [];
  let prevHook = "";

  // Resume: Grobplot keeps any chapter with scenes; Feinplot only keeps
  // chapters that already have usable schreibPrompts (else re-fill contracts).
  const prevStructured = input.editorial.szenenplotStructured;
  if (prevStructured?.chapters.length) {
    const byNum = new Map(
      prevStructured.chapters.map((c) => [c.number, c] as const),
    );
    for (const sk of skeleton) {
      const prev = byNum.get(sk.number);
      if (!chapterHasScenes(prev)) continue;
      const promptsReady = (prev!.scenes ?? []).every(
        (s) => (s.schreibPrompt ?? "").trim().length >= 40,
      );
      if (!skeletonOnly && !promptsReady) {
        // Keep grob heads in context via prevStructured merge later — still rewrite.
        continue;
      }
      filled.push({
        ...prev!,
        number: sk.number,
        title: sk.title,
        kernsatz: sk.kernsatz || prev!.kernsatz,
        props: sk.props.length ? sk.props : prev!.props,
        events: sk.events.length ? sk.events : prev!.events,
        openThreads: sk.openThreads.length
          ? sk.openThreads
          : prev!.openThreads,
        mustNotRepeat: sk.mustNotRepeat.length
          ? sk.mustNotRepeat
          : prev!.mustNotRepeat,
        introduces: sk.introduces.length ? sk.introduces : prev!.introduces,
        resolves: sk.resolves.length ? sk.resolves : prev!.resolves,
        arcBeats: sk.arcBeats.length ? sk.arcBeats : prev!.arcBeats,
      });
      resumedChapters.push(sk.number);
      const last = prev!.scenes[prev!.scenes.length - 1];
      prevHook = last?.continuity.next_scene_hook?.trim() || prevHook;
    }
  }

  const doneNums = new Set(filled.map((c) => c.number));
  const remaining = skeleton.filter((c) => !doneNums.has(c.number));
  const total = skeleton.length;

  if (resumedChapters.length > 0) {
    await input.onProgress?.(
      `Szenenplot · Fortsetzen: ${resumedChapters.length}/${total} Kap. fertig — ${remaining.length} noch …`,
    );
  }

  const emitPartial = async (
    phase: SzenenplotDetailPartialPhase,
    chapterNumber?: number,
  ) => {
    if (!input.onPartial) return;
    const structured = ensureSchreibPrompts({
      updatedAt: new Date().toISOString(),
      modelLabel: model.label,
      centralArcs,
      chapters: renumberSceneIds(
        [...filled].sort((a, b) => a.number - b.number),
      ),
      schreibPromptsFrozenAt: null,
    });
    await input.onPartial({
      structured,
      szenenplot: structuredSzenenplotToMarkdown(structured),
      wissensGraph,
      phase,
      chapterNumber,
    });
  };

  for (let i = 0; i < remaining.length; i += SCENES_BATCH_SIZE) {
    const batch = remaining.slice(i, i + SCENES_BATCH_SIZE);
    const batchNums = batch.map((c) => c.number).join(", ");
    const doneAfter = filled.length + batch.length;
    await input.onProgress?.(
      `Szenenplot · Kap. ${batchNums} (${doneAfter}/${total}): Szenenverträge …`,
    );

    const outlineBlock = skeleton
      .map((c) => {
        const geruestCh = input.geruest.chapters.find(
          (g) => g.number === c.number,
        );
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
        const inhalt = geruestCh?.inhaltKurz?.trim()
          ? ` | Inhalt: ${geruestCh.inhaltKurz.slice(0, OUTLINE_INHALT_CHARS)}`
          : "";
        return `- Kap. ${c.number} — ${c.title}: ${c.kernsatz}${
          planBits ? ` [${planBits}]` : ""
        }${inhalt}${batch.some((b) => b.number === c.number) ? " ← DIESES BATCH" : ""}`;
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

    const userText = `${liveGraphBlock ? `${liveGraphBlock}\n` : ""}${arcsHint}
# Freigegebenes Kapitelgerüst (verbindlich — keine neuen Kapitel)
${outlineBlock}

${
  prevHook
    ? `# Hook aus vorheriger Szene (nahtlos fortsetzen)\n${prevHook}\n`
    : ""
}
${
  weave && filled.length === 0
    ? `# Bisheriger Szenenplot (verweben)\n${input.existingPlot.trim().slice(0, CLIP.szenenplot)}\n`
    : ""
}
# Dieser Batch — Kapitel ${batchNums}
${
  skeletonOnly
    ? `GROBPLOT — Schreibe NUR diese Kapitel mit Szenen-Köpfen (typisch 2–5 pro Kapitel).
Jede Szene NUR: scene_id, heading, summary (1–2 Sätze), characters_present.
dramaturgy/information_flow/continuity/schreibPrompt weglassen oder leer lassen (Feinplot füllt später).
scene_id fortlaufend SZ_01… innerhalb des Batches ok.
Gerüst-Plan übernehmen — keine neuen Kapitel, keine Doppel-Einführung.
Auf Deutsch. Kurz.`
    : `FEINPLOT — Schreibe NUR diese Kapitel mit vollständigen Szenen (typisch 2–5 pro Kapitel).
Jede Szene: dramaturgy, information_flow, continuity, schreibPrompt (Co-Autor-Auftrag).
Wenn Grobplot-Szenen schon existieren: Verträge darauf aufbauen, nicht neu erfinden.
scene_id fortlaufend SZ_01… innerhalb des Batches ok (werden später normalisiert).
Gerüst-Plan übernehmen — keine Doppel-Einführung; Arc-mustShow in dramaturgy spiegeln.
KONKRET: Farben, Kennzeichen, Hausnummern, Adressen, Uhrzeiten, Daten, Namen in Summary/schreibPrompt/props festhalten.
schreibPrompt = verbindlicher Ausformulier-Auftrag (Imperativ): sichtbare Beats, Props/Events, Hooks; kept_secret explizit als DARF-NICHT; KEINE Prosa, KEINE neuen Stränge — der Manuskript-Co-Autor soll nur Ton/Emotion liefern können.
Continuity RÄUMLICH: character_states_after = Figur → Ort/Etage (+ ggf. barfuß/angezogen); prop_placements_after = Prop → Ablageort (z. B. Schuhe: Garderobe EG). next_scene_hook-Bewegung muss dazu passen (kein „hoch“, wenn Figur schon OG).
Auf Deutsch. Felder kurz (1–2 Sätze).`
}

Schema (nur die Kapitel dieses Batches in chapters[]; centralArcs weglassen):
${SZENENPLOT_STRUCTURED_SCHEMA_HINT}

Nur JSON.`;

    let batchRaw = "";
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (attempt > 0) {
          await input.onProgress?.(
            `Szenenplot · Kap. ${batchNums}: erneuter Versuch nach Timeout …`,
          );
          await sleep(800);
        }
        batchRaw = await generateText({
          model,
          systemInstruction: systemBase,
          cacheablePrefix: staticPrefix,
          userText,
          preferJson: true,
          maxTokens: SCENES_BATCH_MAX_TOKENS,
          timeoutMs: SCENES_BATCH_TIMEOUT_MS,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!isAiAbortError(error) || attempt === 1) throw error;
      }
    }
    if (lastError) throw lastError;

    let batchParsed: RomanSzenenplotStructured | null = null;
    try {
      const obj = await parseModelJsonObjectWithRepair({
        raw: batchRaw,
        model,
        schemaHint: SZENENPLOT_STRUCTURED_SCHEMA_HINT,
        errorLabel: `Szenenplot-Batch Kap. ${batchNums}`,
        maxTokens: SCENES_BATCH_MAX_TOKENS,
        timeoutMs: SCENES_BATCH_TIMEOUT_MS,
      });
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

    if (wissensGraph) {
      try {
        wissensGraph = await growWissensGraphFromSzenenBatch({
          previous: wissensGraph,
          batchChapters: batchFilled,
          skeletonOutline: outlineBlock,
        });
      } catch {
        // Fail-soft.
      }
    }

    await emitPartial("batch", batch[batch.length - 1]?.number);
  }

  if (filled.length < 2) {
    throw new Error(
      "Entwicklungslektor lieferte zu wenige Kapitel im Szenenplot. Bitte erneut versuchen.",
    );
  }

  await input.onProgress?.(
    "Szenenplot · Wissensgraph: Lücken schließen …",
  );

  const baseStructured: RomanSzenenplotStructured = {
    updatedAt: new Date().toISOString(),
    modelLabel: model.label,
    centralArcs,
    chapters: renumberSceneIds(
      [...filled].sort((a, b) => a.number - b.number),
    ),
    schreibPromptsFrozenAt: null,
  };
  const structured = skeletonOnly
    ? baseStructured
    : ensureSchreibPrompts(baseStructured);

  const markdown = structuredSzenenplotToMarkdown(structured);

  if (wissensGraph) {
    try {
      wissensGraph = await closeWissensGraphGaps({
        graph: wissensGraph,
        structured,
        ideeKurz: input.ideeKurz,
        rechercheDossier,
        tonalitaet,
      });
    } catch {
      // Fail-soft.
    }
  }

  await emitPartial("final");

  return {
    szenenplot: markdown,
    structured,
    woven: weave || resumedChapters.length > 0,
    modelLabel: model.label,
    wissensGraph,
    resumedChapters,
  };
}

/** Freeze schreibPrompts after Szenenplot Freigabe (Fertig). */
export function freezeSzenenplotSchreibPrompts(
  structured: RomanSzenenplotStructured,
): RomanSzenenplotStructured {
  const ensured = ensureSchreibPrompts(structured);
  return {
    ...ensured,
    schreibPromptsFrozenAt: new Date().toISOString(),
  };
}

/**
 * Entwicklungslektor critique of structured Szenenplot (contracts only).
 */
export async function critiqueSzenenplotDetailMitEntwicklungslektor(input: {
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
  structured?: RomanSzenenplotStructured | null;
  tonalitaet?: string;
}): Promise<SzenenplotDetailCritiqueResult> {
  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);
  const expose = exposeTextFromEditorial(input.editorial);
  const chars = formatCharaktere(input.charaktere);
  const artifact =
    input.structured?.chapters.length
      ? structuredSzenenplotToMarkdown(input.structured)
      : input.szenenplot;

  const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Du prüfst den detaillierten Szenenplot (Handlungskette, Intro/Resolve, Arc→Szene, schreibPrompt) — keine Prosa.`;

  const userText = `${compliance}

# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Exposé (Auszug)
${expose.slice(0, CLIP.expose)}

# Figuren (Auszug)
${chars.slice(0, CLIP.charaktere)}

# Welt
${input.weltSchauplaetze.slice(0, CLIP.weltSchau)}
${input.weltRegeln.slice(0, CLIP.weltRegeln)}

# Szenenplot
${artifact.slice(0, CLIP.szenenplot)}

Prüfe: Ziel/Hindernis/Wende/Wertewechsel, Continuity, Arc-Coverage, schreibPrompt-Qualität, keine Handlungslöcher.
Antwort als Fließtext (Deutsch).`;

  const critique = await generateText({
    model,
    systemInstruction: system,
    userText,
    maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
    timeoutMs: 90_000,
  });

  return { critique, modelLabel: model.label };
}
