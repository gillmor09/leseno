/**
 * Pipeline stage IDs and display order (tabs).
 * Stages are independent: Verbessern never patches upstream or clears later steps.
 */

export const PIPELINE_STAGES = [
  "idee",
  "charaktere",
  "welt",
  "expose",
  "szenenplot",
  "manuskript",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  idee: "Idee",
  charaktere: "Charaktere",
  welt: "Welt",
  expose: "Spec",
  szenenplot: "Kapitelgerüst",
  manuskript: "Manuskript",
};

/** Stages strictly after `stage` (legacy helper; cascade no longer uses this). */
export function stagesAfter(stage: PipelineStage): PipelineStage[] {
  const idx = PIPELINE_STAGES.indexOf(stage);
  if (idx < 0) return [];
  return PIPELINE_STAGES.slice(idx + 1);
}

export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
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
