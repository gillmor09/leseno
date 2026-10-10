/**
 * Pipeline stage IDs and display order (tabs).
 * Roman path: Spec → Grobgerüst → Feingerüst → Grobplot → Feinplot
 * (Reifegrad-Gate) → Manuskript (Co-Autor) → Reifegrad-Gate → Roman Verbessern
 * (Autor / Opus, content-frozen style + Stilanker/Ton/Regeln).
 * Stage Verbessern (Analyse/Einarbeiten) may invalidate downstream (cascade.ts).
 */

export const PIPELINE_STAGES = [
  "idee",
  "charaktere",
  "welt",
  "expose",
  "grobgeruest",
  "feingeruest",
  "grobplot",
  "feinplot",
  "manuskript",
] as const;

/** Canonical stage order (UI / cascade). */
export type PipelineStageCanonical = (typeof PIPELINE_STAGES)[number];

/**
 * Includes legacy `kapitelgeruest` / `szenenplot` so old history and call sites
 * still type-check; prefer {@link normalizePipelineStage} at boundaries.
 */
export type PipelineStage =
  | PipelineStageCanonical
  | "kapitelgeruest"
  | "szenenplot";

/** Pre-split stage ids → canonical. */
export const LEGACY_PIPELINE_STAGE_ALIASES: Record<
  string,
  PipelineStageCanonical
> = {
  kapitelgeruest: "feingeruest",
  szenenplot: "feinplot",
};

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  idee: "Idee",
  charaktere: "Charaktere",
  welt: "Welt",
  expose: "Spec",
  grobgeruest: "Grobgerüst",
  feingeruest: "Feingerüst",
  grobplot: "Grobplot",
  feinplot: "Feinplot",
  manuskript: "Manuskript",
  kapitelgeruest: "Kapitelgerüst",
  szenenplot: "Szenenplot",
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

/** Kapitelgerüst family (incl. legacy `kapitelgeruest`). */
export function isGeruestStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim();
  return (
    s === "grobgeruest" ||
    s === "feingeruest" ||
    s === "kapitelgeruest"
  );
}

/** Szenenplot family (incl. legacy `szenenplot`). */
export function isPlotStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim();
  return s === "grobplot" || s === "feinplot" || s === "szenenplot";
}

/** Stages strictly after `stage` (cascade / helpers). */
export function stagesAfter(stage: PipelineStage): PipelineStageCanonical[] {
  const canonical = normalizePipelineStage(stage) ?? null;
  if (!canonical) return [];
  const idx = PIPELINE_STAGES.indexOf(canonical);
  if (idx < 0) return [];
  return [...PIPELINE_STAGES.slice(idx + 1)];
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
 * Manuskript draft → Co-Autor; Roman Feinschliff → Autor (Luna) separately
 * in manuskript-verbessern / roman-reifegrad-apply.
 */
export function romanApplyRoleKey(
  stage: PipelineStage,
): "co_autor" | "entwicklungslektor" {
  return stage === "manuskript" ? "co_autor" : "entwicklungslektor";
}
