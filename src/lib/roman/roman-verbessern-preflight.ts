/**
 * Hard gate before Roman Verbessern (Gemini Lesefluss-Pass).
 * Blocks polish of a weak draft: Manuskript must clear Logik + Dramaturgie +
 * Stil/Lesefluss floors, and Idee Kernkonflikt + Tragfähigkeit must hold —
 * unless Roman tab is marked fertig.
 */

import {
  hardManuskriptFreigabeFindings,
  isManuskriptFreigabeReadyForRoman,
  isPipelineTabFertig,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";

/** Min Manuskript Logik / Dramaturgie % before Roman Verbessern. */
export const MANUSKRIPT_ROMAN_AXIS_MIN_PCT = 70;

/** Min Manuskript Stil / Lesefluss % — floor so stil-pass does not cement a broken register. */
export const MANUSKRIPT_ROMAN_STIL_MIN_PCT = 60;

/** Min Idee-Kernkonflikt % (craft B → dramaturgiePct) before Roman Verbessern. */
export const IDEE_KERNKONFLIKT_MIN_PCT = 70;
/** @deprecated Use {@link IDEE_KERNKONFLIKT_MIN_PCT}. */
export const IDEE_VERSPRECHEN_MIN_PCT = IDEE_KERNKONFLIKT_MIN_PCT;

/** Min Idee-Tragfähigkeit % (craft C → leseflussPct) before Roman Verbessern. */
export const IDEE_TRAGFAEHIGKEIT_MIN_PCT = 65;
/** @deprecated Use {@link IDEE_TRAGFAEHIGKEIT_MIN_PCT}. */
export const IDEE_ALLEINSTELLUNG_MIN_PCT = IDEE_TRAGFAEHIGKEIT_MIN_PCT;

export type RomanVerbessernGate =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Manuskript Reifegrad alone clears the content floors for Roman Verbessern
 * (Logik/Dramaturgie + Stil/Lesefluss). When true, Seam/Payoff + Emotion
 * should not rewrite the draft again — only the Lesefluss stil-pass on romanText.
 */
export function manuskriptClearsRomanContentFloors(
  editorial: RomanEditorial,
): boolean {
  const ms = editorial.reifegrade?.manuskript ?? null;
  if (!ms) return false;
  return (
    ms.regelnPct >= MANUSKRIPT_ROMAN_AXIS_MIN_PCT &&
    ms.dramaturgiePct >= MANUSKRIPT_ROMAN_AXIS_MIN_PCT &&
    ms.stilPct >= MANUSKRIPT_ROMAN_STIL_MIN_PCT &&
    ms.leseflussPct >= MANUSKRIPT_ROMAN_STIL_MIN_PCT
  );
}

/**
 * Why Roman Verbessern is blocked (or ok). Same rules as
 * {@link assertManuskriptReadyForRoman} — use in UI banners.
 */
export function getManuskriptRomanVerbessernGate(input: {
  editorial: RomanEditorial;
}): RomanVerbessernGate {
  const editorial = input.editorial;
  if (isPipelineTabFertig(editorial, "roman")) {
    return { ok: true };
  }

  const manuskript = (editorial.manuskriptText ?? "").trim();
  if (!hasFilledManuskript(manuskript)) {
    return {
      ok: false,
      reason:
        "Zuerst ein Manuskript anlegen — Roman Verbessern braucht den Entwurf als Quelle.",
    };
  }

  const ms = editorial.reifegrade?.manuskript ?? null;
  if (!ms) {
    return {
      ok: false,
      reason: `Manuskript-Reifegrad fehlt — bitte zuerst Manuskript messen (Logik und Dramaturgie je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%, Stil und Lesefluss je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%), bevor der Roman-Feinschliff startet. Notfall: Tab „Roman“ → Fertig (expliziter Feinschliff-Override).`,
    };
  }

  const logik = ms.regelnPct;
  const drama = ms.dramaturgiePct;
  if (
    logik < MANUSKRIPT_ROMAN_AXIS_MIN_PCT ||
    drama < MANUSKRIPT_ROMAN_AXIS_MIN_PCT
  ) {
    return {
      ok: false,
      reason: `Manuskript noch nicht freigabefähig für Roman-Verbessern (Logik ${logik}%, Dramaturgie ${drama}% — Ziel je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%). Bitte Manuskript Verbessern / Dimensionen nachziehen (Notfall: Roman-Fertig als Override).`,
    };
  }

  const stil = ms.stilPct;
  const lesefluss = ms.leseflussPct;
  if (
    stil < MANUSKRIPT_ROMAN_STIL_MIN_PCT ||
    lesefluss < MANUSKRIPT_ROMAN_STIL_MIN_PCT
  ) {
    return {
      ok: false,
      reason: `Manuskript-Stil noch zu schwach als Anker für Roman-Verbessern (Stil ${stil}%, Lesefluss ${lesefluss}% — Ziel je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%). Bitte Stil/Lesefluss nachziehen (Notfall: Roman-Fertig als Override).`,
    };
  }

  const idee = editorial.reifegrade?.idee ?? null;
  if (!idee) {
    return {
      ok: false,
      reason: `Idee-Reifegrad fehlt — Kernkonflikt (≥${IDEE_KERNKONFLIKT_MIN_PCT}%) und Tragfähigkeit (≥${IDEE_TRAGFAEHIGKEIT_MIN_PCT}%) müssen gemessen sein, bevor der Roman-Feinschliff startet. Tab „Idee“ → Reifegrad messen (Notfall: Roman-Fertig).`,
    };
  }
  /** Idee craft B = Kernkonflikt (stored as dramaturgiePct). */
  const kernkonflikt = idee.dramaturgiePct;
  if (kernkonflikt < IDEE_KERNKONFLIKT_MIN_PCT) {
    return {
      ok: false,
      reason: `Idee-Kernkonflikt zu schwach für Roman-Verbessern (Kernkonflikt ${kernkonflikt}% — Ziel ≥${IDEE_KERNKONFLIKT_MIN_PCT}%). Bitte Idee nachschärfen (Notfall: Roman-Fertig).`,
    };
  }
  /** Idee craft C = Tragfähigkeit (stored as leseflussPct). */
  const tragfaehigkeit = idee.leseflussPct;
  if (tragfaehigkeit < IDEE_TRAGFAEHIGKEIT_MIN_PCT) {
    return {
      ok: false,
      reason: `Idee-Tragfähigkeit zu schwach für Roman-Verbessern (Tragfähigkeit ${tragfaehigkeit}% — Ziel ≥${IDEE_TRAGFAEHIGKEIT_MIN_PCT}%). Bitte Idee nachschärfen (Notfall: Roman-Fertig).`,
    };
  }

  if (!isManuskriptFreigabeReadyForRoman(editorial)) {
    const freigabe = editorial.manuskriptFreigabe;
    const n = hardManuskriptFreigabeFindings(freigabe?.findings).length;
    if (!freigabe?.checkedAt) {
      return {
        ok: false,
        reason:
          "Zuerst im Tab Manuskript „fertig“ setzen — dort läuft der Seam/Payoff-/Canon-Check (Schreiben-Hard-Gate). Ohne Freigabe startet der Roman-Feinschliff nicht.",
      };
    }
    if (n > 0 && !freigabe.overrideAt) {
      return {
        ok: false,
        reason: `Manuskript-Freigabe: noch ${n} harte Hinweis${n === 1 ? "" : "e"} (Canon/Timeline/Plot-Wahrheit/Nähte). Bitte im Manuskript nachziehen oder dort „Trotzdem freigeben“ — sonst kein Roman-Feinschliff.`,
      };
    }
    return {
      ok: false,
      reason:
        "Manuskript geändert seit dem letzten Freigabe-Check — bitte erneut „fertig“ setzen (Seam/Payoff), bevor Verbessern startet.",
    };
  }

  return { ok: true };
}

/**
 * Block Roman Verbessern unless Manuskript Reifegrad and Idee-Kernkonflikt
 * clear thresholds — or Roman fertig (override).
 */
export function assertManuskriptReadyForRoman(input: {
  editorial: RomanEditorial;
}): void {
  const gate = getManuskriptRomanVerbessernGate(input);
  if (!gate.ok) throw new Error(gate.reason);
}
