/**
 * Post-apply Reifegrad guard: reject patches that lower Gesamt maturity
 * beyond a small measurement tolerance (Bewertung noise).
 * Used by Verbessern- and Dimensions-Einarbeiten to stop Verschlimmbessern.
 */

import type { StageReifegrad } from "@/lib/roman/reifegrad-model";

/**
 * Allowed Gesamt drop in percentage points after Einarbeiten.
 * Drops within this band keep the patch (Bewertung can jitter ±1–2).
 */
export const REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP = 2;

/**
 * True when the new Gesamt score fell by more than the tolerance.
 * First assessment (no previous) never counts as regression.
 */
export function reifegradGesamtRegressed(
  previous: StageReifegrad | null | undefined,
  next: StageReifegrad,
): boolean {
  if (!previous) return false;
  return (
    next.gesamtPct <
    previous.gesamtPct - REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP
  );
}

/** Short German summary for history / toast when a patch is rolled back. */
export function formatReifegradRegressionSummary(input: {
  label: string;
  previousPct: number;
  nextPct: number;
}): string {
  const drop = input.previousPct - input.nextPct;
  return `${input.label} verworfen — Reifegrad wäre von ${input.previousPct}% auf ${input.nextPct}% gefallen (−${drop}, Toleranz ${REIFEGRAD_GESAMT_REGRESSION_TOLERANCE_PP} überschritten).`;
}
