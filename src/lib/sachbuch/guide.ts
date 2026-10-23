/**
 * Guided Sachbuch wizard: resolve step, unlock rules, hard server gates.
 * Approval = idee.guide.ideaApprovedAt (never inferred from legacy ready).
 */

import { hasConfirmedSachbuchBookType } from "@/lib/sachbuch/book-types";
import type {
  SachbuchGuide,
  SachbuchGuideStep,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { SACHBUCH_GUIDE_STEPS } from "@/lib/sachbuch/types";

export type SachbuchGuideGatePhase =
  | "refine"
  | "book_type"
  | "evidenz"
  | "makro"
  | "write"
  | "export";

export function emptySachbuchGuide(
  step: SachbuchGuideStep = "concept",
): SachbuchGuide {
  return { currentStep: step, ideaApprovedAt: null };
}

export function hasUsableSachbuchConcept(book: SachbuchKontext): boolean {
  return (
    book.idee.briefing.trim().length >= 20 ||
    book.idee.unpopularOpinion.trim().length >= 20
  );
}

export function isSachbuchIdeaApproved(book: SachbuchKontext): boolean {
  return Boolean(book.idee.guide.ideaApprovedAt?.trim());
}

function stepIndex(step: SachbuchGuideStep): number {
  return SACHBUCH_GUIDE_STEPS.indexOf(step);
}

/**
 * Hard-gate floor: everything at/below this is unlocked.
 * After idea approval + book type, Evidenz/Makro/Schreiben/Export are open
 * (Weiter without forcing research). Writing actions still need Kapitel.
 */
export function resolveSachbuchGuideFloor(book: SachbuchKontext): SachbuchGuideStep {
  if (!hasUsableSachbuchConcept(book)) return "concept";
  if (!isSachbuchIdeaApproved(book)) return "refine";
  if (!hasConfirmedSachbuchBookType(book.makro.bookTypeId)) return "book_type";
  return "export";
}

/** Steps the user may open (all up to floor, plus current if valid). */
export function unlockedSachbuchGuideSteps(
  book: SachbuchKontext,
): SachbuchGuideStep[] {
  const floor = resolveSachbuchGuideFloor(book);
  const max = stepIndex(floor);
  return SACHBUCH_GUIDE_STEPS.filter((_, i) => i <= max);
}

export function canOpenSachbuchGuideStep(
  book: SachbuchKontext,
  step: SachbuchGuideStep,
): boolean {
  return unlockedSachbuchGuideSteps(book).includes(step);
}

/**
 * Clamp stored currentStep to something unlocked; prefer stored if still valid.
 */
export function effectiveSachbuchGuideStep(
  book: SachbuchKontext,
): SachbuchGuideStep {
  const stored = book.idee.guide.currentStep;
  if (canOpenSachbuchGuideStep(book, stored)) return stored;
  return resolveSachbuchGuideFloor(book);
}

/**
 * Hard gate for server actions. German error messages for toasts.
 */
export function assertSachbuchGuideAllows(
  book: SachbuchKontext,
  phase: SachbuchGuideGatePhase,
): void {
  if (phase === "refine") {
    if (!hasUsableSachbuchConcept(book)) {
      throw new Error(
        "Zuerst Rohkonzept / Idee ausarbeiten (mind. ein klares Briefing).",
      );
    }
    return;
  }

  if (!isSachbuchIdeaApproved(book)) {
    throw new Error(
      "Idee noch nicht freigegeben — zuerst agentische Verfeinerung abschließen und freigeben.",
    );
  }

  if (phase === "book_type") return;

  if (!hasConfirmedSachbuchBookType(book.makro.bookTypeId)) {
    throw new Error("Zuerst Sachbuchtyp aus dem Konzept übernehmen.");
  }

  if (phase === "evidenz") return;

  if (phase === "makro") return;

  if (phase === "export") return;

  // write: graph + abschnitte
  if (book.kapitel.length === 0) {
    throw new Error(
      "Noch keine Kapitel — zuerst Makro erzeugen und Kapitel anlegen.",
    );
  }
}

export function nextSachbuchGuideStep(
  step: SachbuchGuideStep,
): SachbuchGuideStep | null {
  const i = stepIndex(step);
  if (i < 0 || i >= SACHBUCH_GUIDE_STEPS.length - 1) return null;
  return SACHBUCH_GUIDE_STEPS[i + 1]!;
}
