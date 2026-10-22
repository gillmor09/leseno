/**
 * Post-apply Reifegrad guard: reject patches that clearly worsen maturity
 * beyond measurement noise. Used by Verbessern- and Dimensions-Einarbeiten.
 *
 * Dimension apply: guard the *target axis* (plus catastrophic Gesamt).
 * Gesamt-only ±5 jitter was rolling back real Manuskript-Patches
 * (Logik Depot/Fristen) while the toast looked like success.
 * Plot (Ereignisplan) / Gerüst: exempt — structural Logik may dip Gesamt.
 */

import type {
  ReifegradAssessKey,
  StageReifegrad,
} from "@/lib/roman/reifegrad-model";
import { isGeruestStage } from "@/lib/roman/pipeline/stages";
import {
  findDimensionDefForAssessKey,
  pctForDimension,
  type ReifegradDimension,
} from "@/lib/roman/reifegrad-craft";

/**
 * Allowed target-axis / Gesamt drop in percentage points after Einarbeiten.
 * Drops within this band keep the patch (Bewertung can jitter ±1–2).
 */
export const REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP = 2;

/**
 * Catastrophic Gesamt drop that still rolls back a dimension patch even when
 * the target axis held (other axes collapsed).
 */
export const REIFEGRAD_CATASTROPHIC_GESAMT_DROP_PP = 10;

/**
 * True when the new Gesamt score fell by more than the tolerance.
 * First assessment (no previous) never counts as regression.
 * Plot / Kapitelgerüst stages never count as regression.
 * Prefer {@link reifegradDimensionApplyRegressed} for single-dimension apply.
 */
export function reifegradGesamtRegressed(
  previous: StageReifegrad | null | undefined,
  next: StageReifegrad,
  stage?: string | null,
): boolean {
  if (!previous) return false;
  if (stage && isGeruestStage(stage)) return false;
  return (
    next.gesamtPct <
    previous.gesamtPct - REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP
  );
}

/**
 * Dimension-Einarbeiten guard: roll back only if the *target* axis tanks, or
 * Gesamt collapses catastrophically. A −5 Gesamt with stable/better Logik
 * is Bewerter noise — keep the Co-Autor patch.
 */
export function reifegradDimensionApplyRegressed(
  previous: StageReifegrad | null | undefined,
  next: StageReifegrad,
  input: {
    stage: ReifegradAssessKey | string;
    dimension: ReifegradDimension;
  },
): boolean {
  if (!previous) return false;
  if (input.stage && isGeruestStage(input.stage)) return false;

  const def = findDimensionDefForAssessKey(
    input.stage as ReifegradAssessKey,
    input.dimension,
  );
  if (def) {
    const before = pctForDimension(previous, def);
    const after = pctForDimension(next, def);
    if (after < before - REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP) {
      return true;
    }
  }

  return (
    next.gesamtPct <
    previous.gesamtPct - REIFEGRAD_CATASTROPHIC_GESAMT_DROP_PP
  );
}

/** Short German summary for history / toast when a patch is rolled back. */
export function formatReifegradRegressionSummary(input: {
  label: string;
  previousPct: number;
  nextPct: number;
  /** When set, clarify which axis triggered the rollback. */
  axisLabel?: string;
  axisPreviousPct?: number;
  axisNextPct?: number;
}): string {
  if (
    input.axisLabel != null &&
    input.axisPreviousPct != null &&
    input.axisNextPct != null &&
    input.axisNextPct <
      input.axisPreviousPct - REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP
  ) {
    const drop = input.axisPreviousPct - input.axisNextPct;
    return `${input.label} verworfen — ${input.axisLabel} wäre von ${input.axisPreviousPct}% auf ${input.axisNextPct}% gefallen (−${drop}, Toleranz ${REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP}).`;
  }
  const drop = input.previousPct - input.nextPct;
  return `${input.label} verworfen — Reifegrad wäre von ${input.previousPct}% auf ${input.nextPct}% gefallen (−${drop}, Katastrophen-Toleranz ${REIFEGRAD_CATASTROPHIC_GESAMT_DROP_PP} überschritten).`;
}
