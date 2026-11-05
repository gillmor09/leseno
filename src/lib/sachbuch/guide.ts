/**
 * Guided Sachbuch wizard: resolve step, unlock rules, hard server gates.
 * Approval = idee.guide.ideaApprovedAt / writeApprovedAt (never inferred).
 */

import { hasConfirmedSachbuchBookType } from "@/lib/sachbuch/book-types";
import { concatAbschnitteText, countSachbuchWords } from "@/lib/sachbuch/parse";
import type {
  SachbuchGuide,
  SachbuchGuideStep,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_COMPACT_SKIPPED_STEPS,
  SACHBUCH_GUIDE_STEPS,
} from "@/lib/sachbuch/types";

export type SachbuchGuideGatePhase =
  | "refine"
  | "book_type"
  | "evidenz"
  | "makro"
  | "write"
  | "manuscript"
  | "herstellung"
  | "export"
  | "hoerbuch";

export function emptySachbuchGuide(
  step: SachbuchGuideStep = "concept",
): SachbuchGuide {
  return {
    currentStep: step,
    ideaApprovedAt: null,
    writeApprovedAt: null,
  };
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

/** True when Phase 5 Schreiben is frozen (Manuskript unlocked). */
export function isSachbuchWriteApproved(book: SachbuchKontext): boolean {
  return Boolean(book.idee.guide.writeApprovedAt?.trim());
}

/** Executive Briefing derived from the Hauptband. */
export function isSachbuchCompact(book: SachbuchKontext): boolean {
  return book.idee.edition === "compact";
}

/** Marketing teaser derived from Kompakt (newsletter / brochure / web). */
export function isSachbuchTeaser(book: SachbuchKontext): boolean {
  return book.idee.edition === "teaser";
}

/** Kompakt or Teaser — Rohkonzept through Schreiben stay closed. */
export function isSachbuchDerivedEdition(book: SachbuchKontext): boolean {
  return isSachbuchCompact(book) || isSachbuchTeaser(book);
}

export function isSachbuchCompactSkippedStep(step: SachbuchGuideStep): boolean {
  return (SACHBUCH_COMPACT_SKIPPED_STEPS as readonly string[]).includes(step);
}

/** @deprecated Prefer isSachbuchDerivedSkippedStep — same list. */
export const isSachbuchDerivedSkippedStep = isSachbuchCompactSkippedStep;

/** Soft readiness: every chapter has enough Abschnitte prose to freeze. */
export function sachbuchSchreibenReadyToFreeze(book: SachbuchKontext): {
  ok: boolean;
  reason?: string;
} {
  if (book.kapitel.length === 0) {
    return { ok: false, reason: "Noch keine Kapitel." };
  }
  for (const k of book.kapitel) {
    const words = countSachbuchWords(concatAbschnitteText(k.abschnitte));
    if (words < 2_000) {
      return {
        ok: false,
        reason: `Kapitel „${k.title || "ohne Titel"}“ hat zu wenig Text (${words} Wörter).`,
      };
    }
  }
  return { ok: true };
}

function stepIndex(step: SachbuchGuideStep): number {
  return SACHBUCH_GUIDE_STEPS.indexOf(step);
}

/**
 * Hard-gate floor: everything at/below this is unlocked.
 * After idea + book type: through Schreiben. After write freeze: Manuskript → Herstellung → Export.
 */
export function resolveSachbuchGuideFloor(book: SachbuchKontext): SachbuchGuideStep {
  if (!hasUsableSachbuchConcept(book)) return "concept";
  if (!isSachbuchIdeaApproved(book)) return "refine";
  if (!hasConfirmedSachbuchBookType(book.makro.bookTypeId)) return "book_type";
  if (!isSachbuchWriteApproved(book)) return "write";
  return "hoerbuch";
}

/** Steps the user may open (all up to floor, plus current if valid). */
export function unlockedSachbuchGuideSteps(
  book: SachbuchKontext,
): SachbuchGuideStep[] {
  const floor = resolveSachbuchGuideFloor(book);
  const max = stepIndex(floor);
  const open = SACHBUCH_GUIDE_STEPS.filter((_, i) => i <= max);
  if (!isSachbuchDerivedEdition(book)) return open;
  return open.filter((step) => !isSachbuchCompactSkippedStep(step));
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
  if (isSachbuchDerivedEdition(book)) return "manuscript";
  return resolveSachbuchGuideFloor(book);
}

/**
 * Hard gate for server actions. German error messages for toasts.
 */
export function assertSachbuchGuideAllows(
  book: SachbuchKontext,
  phase: SachbuchGuideGatePhase,
): void {
  if (
    isSachbuchDerivedEdition(book) &&
    phase !== "manuscript" &&
    phase !== "herstellung" &&
    phase !== "export" &&
    phase !== "hoerbuch"
  ) {
    throw new Error(
      isSachbuchTeaser(book)
        ? "Teaser — dieser Schritt entfällt."
        : "Kompakt-Ausgabe — dieser Schritt entfällt.",
    );
  }

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

  if (phase === "export" || phase === "hoerbuch") return;

  if (phase === "manuscript" || phase === "herstellung") {
    if (!isSachbuchWriteApproved(book)) {
      throw new Error(
        "Schreiben noch nicht freigegeben — zuerst Rohentwurf fixieren.",
      );
    }
    if (book.kapitel.length === 0) {
      throw new Error(
        phase === "herstellung"
          ? "Keine Kapitel für die Herstellung."
          : "Keine Kapitel für das Manuskript.",
      );
    }
    return;
  }

  // write: graph + abschnitte
  if (isSachbuchWriteApproved(book)) {
    throw new Error(
      "Schreiben ist freigegeben/fixiert — zum Nacharbeiten Manuskript öffnen oder Schreiben wieder freigeben.",
    );
  }
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
