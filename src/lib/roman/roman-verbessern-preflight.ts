/**
 * Hard gate before Roman Verbessern (Opus Stil-Pass).
 * Blocks polish of a weak draft: Manuskript must clear Logik + Dramaturgie +
 * Stil/Lesefluss floors, and Idee Versprechen/Alleinstellung must hold —
 * unless Roman tab is marked fertig.
 */

import {
  isManuskriptFreigabeReadyForRoman,
  isPipelineTabFertig,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";

/** Min Manuskript Logik / Dramaturgie % before Roman Verbessern. */
export const MANUSKRIPT_ROMAN_AXIS_MIN_PCT = 70;

/** Min Manuskript Stil / Lesefluss % — floor so Opus does not cement a broken register. */
export const MANUSKRIPT_ROMAN_STIL_MIN_PCT = 60;

/** Min Idee-Versprechen % (craft B → dramaturgiePct) before Roman Verbessern. */
export const IDEE_VERSPRECHEN_MIN_PCT = 70;

/** Min Idee-Alleinstellung % (craft C → leseflussPct). */
export const IDEE_ALLEINSTELLUNG_MIN_PCT = 40;

export type RomanVerbessernGate =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Manuskript Reifegrad alone clears the content floors for Roman Verbessern
 * (Logik/Dramaturgie + Stil/Lesefluss). When true, Seam/Payoff + Emotion
 * should not rewrite the draft again — only the Opus stil-pass on romanText.
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
      reason: `Manuskript-Reifegrad fehlt — bitte zuerst Manuskript messen (Logik und Dramaturgie je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%, Stil und Lesefluss je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%), bevor der Roman-Feinschliff startet. Oder „Roman fertig“ setzen.`,
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
      reason: `Manuskript noch nicht freigabefähig für Roman-Verbessern (Logik ${logik}%, Dramaturgie ${drama}% — Ziel je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%). Bitte Manuskript Verbessern / Dimensionen nachziehen oder „Roman fertig“ setzen.`,
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
      reason: `Manuskript-Stil noch zu schwach als Anker für Roman-Verbessern (Stil ${stil}%, Lesefluss ${lesefluss}% — Ziel je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%). Bitte Stil/Lesefluss nachziehen oder „Roman fertig“ setzen.`,
    };
  }

  const idee = editorial.reifegrade?.idee ?? null;
  if (!idee) {
    return {
      ok: false,
      reason: `Idee-Reifegrad fehlt — Versprechen muss gemessen sein (Versprechen ≥${IDEE_VERSPRECHEN_MIN_PCT}%), bevor der Roman-Feinschliff startet. Tab „Idee“ → Reifegrad messen, oder „Roman fertig“ setzen.`,
    };
  }
  /** Idee craft B = Versprechen (stored as dramaturgiePct). */
  const versprechen = idee.dramaturgiePct;
  if (versprechen < IDEE_VERSPRECHEN_MIN_PCT) {
    return {
      ok: false,
      reason: `Leseversprechen zu schwach für Roman-Verbessern (Idee · Versprechen ${versprechen}% — Ziel ≥${IDEE_VERSPRECHEN_MIN_PCT}%). Bitte Idee nachschärfen oder „Roman fertig“ setzen.`,
    };
  }
  /** Idee craft C = Alleinstellung (stored as leseflussPct). */
  const alleinstellung = idee.leseflussPct;
  if (alleinstellung < IDEE_ALLEINSTELLUNG_MIN_PCT) {
    return {
      ok: false,
      reason: `Idee-Alleinstellung zu schwach für Roman-Verbessern (Alleinstellung ${alleinstellung}% — Ziel ≥${IDEE_ALLEINSTELLUNG_MIN_PCT}%). Bitte Idee schärfen oder „Roman fertig“ setzen.`,
    };
  }

  if (!isManuskriptFreigabeReadyForRoman(editorial)) {
    const freigabe = editorial.manuskriptFreigabe;
    const n = freigabe?.findings.length ?? 0;
    if (!freigabe?.checkedAt) {
      return {
        ok: false,
        reason:
          "Zuerst Manuskript „fertig“ setzen — dort läuft der günstige Seam/Payoff-Check. Ohne Freigabe startet der teure Stil-Pass nicht.",
      };
    }
    if (n > 0 && !freigabe.overrideAt) {
      return {
        ok: false,
        reason: `Manuskript-Freigabe: noch ${n} Hinweis${n === 1 ? "" : "e"} (Nähte/Payoffs/Emotion). Bitte im Manuskript nachziehen oder dort „Trotzdem freigeben“ — sonst kein Opus-Stil-Pass.`,
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
 * Block Roman Verbessern unless Manuskript Reifegrad and Idee-Versprechen
 * clear thresholds — or Roman fertig (override).
 */
export function assertManuskriptReadyForRoman(input: {
  editorial: RomanEditorial;
}): void {
  const gate = getManuskriptRomanVerbessernGate(input);
  if (!gate.ok) throw new Error(gate.reason);
}
