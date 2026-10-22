/**
 * Pipeline stage IDs and process phases for the Roman work system.
 * Path: Idee → Rahmen → Fundament → Exposé → Graph → Plot → Szenen → Manuskript
 * (+ Lektorat + Export as post-MS process phases).
 * Author freigabe is separate from hard-gates — see `phase-state.ts`.
 */

/** UI / cascade / Erzeugen order (canonical pipeline stages). */
export const PIPELINE_STAGES = [
  "idee",
  "rahmen",
  "fundament",
  "expose",
  "graph",
  "plot",
  "szenen",
  "manuskript",
] as const;

export type PipelineStageCanonical = (typeof PIPELINE_STAGES)[number];

/**
 * Full process phases including Lektorat + Export (no separate Erzeugen stage yet).
 * Freigabe keys live on these ids.
 */
export const PROCESS_PHASES = [
  ...PIPELINE_STAGES,
  "lektorat",
  "export",
] as const;

export type ProcessPhase = (typeof PROCESS_PHASES)[number];

/**
 * Includes legacy / split-era ids so old history and call sites still type-check.
 * Prefer {@link normalizePipelineStage} at boundaries.
 */
export type PipelineStage =
  | PipelineStageCanonical
  | "charaktere"
  | "welt"
  | "kapitelgeruest"
  | "szenenplot"
  | "grobgeruest"
  | "grobplot"
  | "feingeruest"
  | "feinplot";

/** Legacy / pre-process-split ids → canonical. */
export const LEGACY_PIPELINE_STAGE_ALIASES: Record<
  string,
  PipelineStageCanonical
> = {
  /** Basics tab */
  typ: "rahmen",
  basics: "rahmen",
  /** Spec split */
  charaktere: "fundament",
  welt: "fundament",
  spec: "expose",
  /** Former Gerüst / unified plot → Plot (Ereignisplan) */
  kapitelgeruest: "plot",
  grobgeruest: "plot",
  feingeruest: "plot",
  /** Former Szenenplot / Feinplot → Szenen */
  szenenplot: "szenen",
  grobplot: "szenen",
  feinplot: "szenen",
};

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  idee: "Idee",
  rahmen: "Rahmen",
  fundament: "Fundament",
  expose: "Exposé",
  graph: "Wissensgraph",
  plot: "Plot",
  szenen: "Szenen",
  manuskript: "Manuskript",
  charaktere: "Fundament",
  welt: "Fundament",
  feingeruest: "Plot",
  grobgeruest: "Plot",
  kapitelgeruest: "Plot",
  feinplot: "Szenen",
  grobplot: "Szenen",
  szenenplot: "Szenen",
};

export const PROCESS_PHASE_LABELS: Record<ProcessPhase, string> = {
  idee: "Idee",
  rahmen: "Rahmen",
  fundament: "Fundament",
  expose: "Exposé",
  graph: "Wissensgraph",
  plot: "Plot",
  szenen: "Szenen",
  manuskript: "Manuskript",
  lektorat: "Lektorat",
  export: "Export",
};

/**
 * Map legacy or current stage string to a canonical {@link PipelineStage}.
 */
export function normalizePipelineStage(
  stage: string | null | undefined,
): PipelineStageCanonical | null {
  const raw = (stage ?? "").trim();
  if (!raw) return null;
  if ((PIPELINE_STAGES as readonly string[]).includes(raw)) {
    return raw as PipelineStageCanonical;
  }
  return LEGACY_PIPELINE_STAGE_ALIASES[raw] ?? null;
}

/** Kapitel-Gerüst / Ereignisplan family. */
export function isGeruestStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim();
  const n = normalizePipelineStage(s);
  return (
    n === "plot" ||
    s === "plot" ||
    s === "feingeruest" ||
    s === "grobgeruest" ||
    s === "kapitelgeruest"
  );
}

/** Szenenplot family (contracts + schreibPrompt). */
export function isPlotStage(stage: string | null | undefined): boolean {
  // Historical name: "plot stage" meant szenenplot; keep helper for scene family.
  const s = (stage ?? "").trim();
  const n = normalizePipelineStage(s);
  return (
    n === "szenen" ||
    s === "szenen" ||
    s === "feinplot" ||
    s === "grobplot" ||
    s === "szenenplot"
  );
}

/** True for Ereignisplan OR Szenen structure stages. */
export function isStructureStage(stage: string | null | undefined): boolean {
  return isGeruestStage(stage) || isPlotStage(stage);
}

export function isGraphStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim();
  return s === "graph" || s === "wissensgraph";
}

export function isFundamentStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim();
  const n = normalizePipelineStage(s);
  return n === "fundament" || s === "charaktere" || s === "welt";
}

/** Stages strictly after `stage` (cascade / helpers). */
export function stagesAfter(stage: PipelineStage): PipelineStageCanonical[] {
  const canonical = normalizePipelineStage(stage) ?? null;
  if (!canonical) return [];
  const idx = PIPELINE_STAGES.indexOf(canonical);
  if (idx < 0) return [];
  return [...PIPELINE_STAGES.slice(idx + 1)];
}

/** Process phases strictly after a phase/stage (lektorat + export after manuskript). */
export function processPhasesAfter(
  stage: PipelineStage | ProcessPhase | string,
): ProcessPhase[] {
  const raw = String(stage ?? "").trim();
  if (raw === "export") return [];
  if (raw === "lektorat") return ["export"];
  const canonical = normalizePipelineStage(raw);
  if (!canonical) {
    if ((PROCESS_PHASES as readonly string[]).includes(raw)) {
      // non-pipeline process phase without further downstream
      return [];
    }
    return [];
  }
  if (canonical === "manuskript") return ["lektorat", "export"];
  const idx = PIPELINE_STAGES.indexOf(canonical);
  if (idx < 0) return [];
  return [
    ...PIPELINE_STAGES.slice(idx + 1),
    "lektorat",
    "export",
  ] as ProcessPhase[];
}

export function stageIndex(stage: PipelineStage): number {
  const canonical = normalizePipelineStage(stage);
  if (!canonical) return -1;
  return PIPELINE_STAGES.indexOf(canonical);
}

/**
 * Clever erzählt Kurzgeschichten: no book-level Reifegrad on manuskript.
 * Per-story Gegenlesen/Verbessern stays available.
 */
export function cleverManuskriptSkipsReifegrad(
  buchTyp: string | null | undefined,
  stage: PipelineStage,
): boolean {
  return buchTyp === "clever_erzaehlt" && stage === "manuskript";
}

/**
 * Who applies Verbessern / Feedback patches on structure stages.
 * Manuskript draft → Co-Autor; stil-pass → Autor separately in manuskript-verbessern.
 */
export function romanApplyRoleKey(
  stage: PipelineStage,
): "co_autor" | "entwicklungslektor" {
  return stage === "manuskript" ? "co_autor" : "entwicklungslektor";
}
