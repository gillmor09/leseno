/**
 * Single navigation strip for the Roman work system:
 * process phases including Lektorat + Export (Cover / Marketing / Hörbuch).
 */

"use client";

import { fingerprintForPhase } from "@/lib/roman/phase-fingerprints";
import {
  getPhaseState,
  isPhaseApproved,
  PROCESS_PHASE_LABELS,
} from "@/lib/roman/phase-state";
import type { ProcessPhase } from "@/lib/roman/pipeline/stages";
import type { RomanEditorial } from "@/lib/roman/editorial";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

/** UI nav keys = process phases (Export is a freigabe phase). */
export type RomanNavStep = ProcessPhase;

export const BELLETRISTIK_NAV_STEPS: readonly RomanNavStep[] = [
  "idee",
  "rahmen",
  "fundament",
  "expose",
  "graph",
  "plot",
  "szenen",
  "manuskript",
  "lektorat",
  "export",
] as const;

export const ROMAN_NAV_STEP_LABELS: Record<RomanNavStep, string> = {
  ...PROCESS_PHASE_LABELS,
};

export function RomanProcessPhaseStrip({
  roman,
  editorial,
  activeStep,
  onSelectStep,
}: {
  roman: RomanKontext;
  editorial: RomanEditorial;
  activeStep?: RomanNavStep | null;
  onSelectStep?: (step: RomanNavStep) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Roman-Prozess"
      className="flex flex-wrap gap-1.5"
    >
      {BELLETRISTIK_NAV_STEPS.map((step, index) => {
        const label = ROMAN_NAV_STEP_LABELS[step];
        const fp = fingerprintForPhase(step, { ...roman, editorial });
        const entry = getPhaseState(editorial, step);
        const approved = isPhaseApproved(editorial, step, fp);
        const fingerprintDrift =
          entry.status === "approved" &&
          Boolean(entry.fingerprint && fp && entry.fingerprint !== fp);
        const stale = entry.status === "stale" || fingerprintDrift;
        const staleReason =
          entry.staleReason ??
          (fingerprintDrift ? "Inhalt seit Freigabe geändert" : null);
        const active = activeStep === step;
        return (
          <button
            key={step}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!onSelectStep}
            onClick={() => onSelectStep?.(step)}
            title={staleReason ?? label}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 transition",
              approved && !stale
                ? "bg-emerald-100 text-emerald-900 ring-emerald-300"
                : stale
                  ? "bg-amber-100 text-amber-950 ring-amber-300"
                  : "bg-white text-zinc-600 ring-zinc-950/10",
              active && "ring-2 ring-zinc-900",
              onSelectStep && "hover:bg-zinc-50",
              !onSelectStep && "cursor-default",
            )}
          >
            {index + 1}. {label}
            {approved && !stale ? " ✓" : stale ? " !" : ""}
          </button>
        );
      })}
    </div>
  );
}
