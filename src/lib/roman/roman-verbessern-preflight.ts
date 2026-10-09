/**
 * Hard gate before Roman Verbessern (Opus Stil-Pass).
 * Blocks polish of a weak draft: Manuskript must clear Logik + Dramaturgie +
 * Stil/Lesefluss floors, and Idee Versprechen/Alleinstellung must hold —
 * unless Roman tab is marked fertig.
 */

import {
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

/**
 * Block Roman Verbessern unless Manuskript Reifegrad and Idee-Versprechen
 * clear thresholds — or Roman fertig (override).
 */
export function assertManuskriptReadyForRoman(input: {
  editorial: RomanEditorial;
}): void {
  const editorial = input.editorial;
  if (isPipelineTabFertig(editorial, "roman")) {
    return;
  }

  const manuskript = (editorial.manuskriptText ?? "").trim();
  if (!hasFilledManuskript(manuskript)) {
    throw new Error(
      "Zuerst ein Manuskript anlegen — Roman Verbessern braucht den Entwurf als Quelle.",
    );
  }

  const ms = editorial.reifegrade?.manuskript ?? null;
  if (!ms) {
    throw new Error(
      `Manuskript-Reifegrad fehlt — bitte zuerst Manuskript messen (Logik und Dramaturgie je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%, Stil und Lesefluss je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%), bevor der Roman-Feinschliff startet. Oder „Roman fertig“ setzen.`,
    );
  }

  const logik = ms.regelnPct;
  const drama = ms.dramaturgiePct;
  if (
    logik < MANUSKRIPT_ROMAN_AXIS_MIN_PCT ||
    drama < MANUSKRIPT_ROMAN_AXIS_MIN_PCT
  ) {
    throw new Error(
      `Manuskript noch nicht freigabefähig für Roman-Verbessern (Logik ${logik}%, Dramaturgie ${drama}% — Ziel je ≥${MANUSKRIPT_ROMAN_AXIS_MIN_PCT}%). Bitte Manuskript Verbessern / Dimensionen nachziehen oder „Roman fertig“ setzen.`,
    );
  }

  const stil = ms.stilPct;
  const lesefluss = ms.leseflussPct;
  if (
    stil < MANUSKRIPT_ROMAN_STIL_MIN_PCT ||
    lesefluss < MANUSKRIPT_ROMAN_STIL_MIN_PCT
  ) {
    throw new Error(
      `Manuskript-Stil noch zu schwach als Anker für Roman-Verbessern (Stil ${stil}%, Lesefluss ${lesefluss}% — Ziel je ≥${MANUSKRIPT_ROMAN_STIL_MIN_PCT}%). Bitte Stil/Lesefluss nachziehen oder „Roman fertig“ setzen.`,
    );
  }

  const idee = editorial.reifegrade?.idee ?? null;
  if (!idee) {
    throw new Error(
      `Idee-Reifegrad fehlt — Versprechen muss gemessen sein (Versprechen ≥${IDEE_VERSPRECHEN_MIN_PCT}%), bevor der Roman-Feinschliff startet. Oder „Roman fertig“ setzen.`,
    );
  }
  /** Idee craft B = Versprechen (stored as dramaturgiePct). */
  const versprechen = idee.dramaturgiePct;
  if (versprechen < IDEE_VERSPRECHEN_MIN_PCT) {
    throw new Error(
      `Leseversprechen zu schwach für Roman-Verbessern (Idee · Versprechen ${versprechen}% — Ziel ≥${IDEE_VERSPRECHEN_MIN_PCT}%). Bitte Idee nachschärfen oder „Roman fertig“ setzen.`,
    );
  }
  /** Idee craft C = Alleinstellung (stored as leseflussPct). */
  const alleinstellung = idee.leseflussPct;
  if (alleinstellung < IDEE_ALLEINSTELLUNG_MIN_PCT) {
    throw new Error(
      `Idee-Alleinstellung zu schwach für Roman-Verbessern (Alleinstellung ${alleinstellung}% — Ziel ≥${IDEE_ALLEINSTELLUNG_MIN_PCT}%). Bitte Idee schärfen oder „Roman fertig“ setzen.`,
    );
  }
}
