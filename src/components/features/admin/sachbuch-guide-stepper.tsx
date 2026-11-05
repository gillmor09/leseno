"use client";

/**
 * Horizontal wizard stepper for the guided Sachbuch flow.
 */

import {
  canOpenSachbuchGuideStep,
  effectiveSachbuchGuideStep,
  isSachbuchDerivedEdition,
  isSachbuchCompactSkippedStep,
  isSachbuchTeaser,
} from "@/lib/sachbuch/guide";
import type { SachbuchGuideStep, SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_GUIDE_STEP_LABELS,
  SACHBUCH_GUIDE_STEPS,
} from "@/lib/sachbuch/types";
import { cn } from "@/lib/utils";

export function SachbuchGuideStepper({
  book,
  canSave,
  pending,
  onSelectStep,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  pending?: boolean;
  onSelectStep: (step: SachbuchGuideStep) => void;
}) {
  const current = effectiveSachbuchGuideStep(book);

  return (
    <nav
      aria-label="Sachbuch-Schritte"
      className="flex flex-wrap gap-2 rounded-3xl bg-white p-3 ring-1 ring-zinc-950/10"
    >
      {SACHBUCH_GUIDE_STEPS.map((step, i) => {
        const open = canOpenSachbuchGuideStep(book, step);
        const active = current === step;
        const skipped =
          isSachbuchDerivedEdition(book) && isSachbuchCompactSkippedStep(step);
        return (
          <button
            key={step}
            type="button"
            disabled={!canSave || pending || !open}
            onClick={() => onSelectStep(step)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold transition",
              active
                ? "bg-orange-700 text-white"
                : open
                  ? "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                  : "bg-zinc-50 text-zinc-400",
            )}
            title={
              skipped
                ? isSachbuchTeaser(book)
                  ? "Teaser — dieser Schritt entfällt"
                  : "Kompakt-Ausgabe — dieser Schritt entfällt"
                : open
                  ? SACHBUCH_GUIDE_STEP_LABELS[step]
                  : "Noch gesperrt — vorherige Schritte abschließen"
            }
          >
            {i + 1}. {SACHBUCH_GUIDE_STEP_LABELS[step]}
          </button>
        );
      })}
    </nav>
  );
}
