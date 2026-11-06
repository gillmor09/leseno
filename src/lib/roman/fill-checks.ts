/**
 * Client-safe emptiness / substance checks for Roman pipeline UI.
 * Keep free of `@/lib/ai/*` so webpack admin bundles do not pull Node APIs.
 */

import type { CleverUnterthemen, RomanEditorial } from "@/lib/roman/editorial";

/** 8–10 → 12 Kapitel; 10–12 → 10 Kapitel (same rule as clever-unterthemen). */
function cleverKapitelSoll(
  editorial: Pick<RomanEditorial, "zielAlterMin" | "zielAlterMax">,
): 10 | 12 {
  const max = editorial.zielAlterMax;
  if (max != null && max <= 10) return 12;
  const min = editorial.zielAlterMin;
  if (min != null && min >= 10) return 10;
  return 12;
}

/** True when Basics look empty enough to auto-fill without confirm. */
export function basicsLookEmptyForAutoDerive(input: {
  genre?: string | null;
  tonalitaet?: string | null;
  editorial?: Pick<RomanEditorial, "grobRegeln"> | null;
}): boolean {
  const ton = (input.tonalitaet ?? "").trim();
  const grob = (input.editorial?.grobRegeln ?? "").trim();
  const genre = (input.genre ?? "").trim();
  return ton.length < 40 && grob.length < 40 && genre.length < 2;
}

/** True when Exposé already has substance. */
export function hasFilledExpose(expose: string): boolean {
  return expose.trim().length >= 80;
}

/** True when Manuskript already has substance. */
export function hasFilledManuskript(text: string): boolean {
  return text.trim().length >= 400;
}

/** True when Kapitelgerüst already has substance. */
export function hasFilledSzenenplot(plot: string): boolean {
  return plot.trim().length >= 80;
}

/** True when world fields already have substance. */
export function hasFilledWelt(welt: {
  weltSchauplaetze: string;
  weltRegeln: string;
}): boolean {
  return (
    welt.weltSchauplaetze.trim().length >= 40 ||
    welt.weltRegeln.trim().length >= 40
  );
}

/** True when Kapitelgerüst already has substance. */
export function hasFilledKapitelGeruest(raw: string): boolean {
  return raw.trim().length >= 80;
}

/** True when Clever-Unterthemen cover the expected chapter count. */
export function hasFilledCleverUnterthemen(
  doc: CleverUnterthemen | null | undefined,
  editorial?: Pick<RomanEditorial, "zielAlterMin" | "zielAlterMax">,
): boolean {
  if (!doc?.kapitel.length) return false;
  const soll = editorial ? cleverKapitelSoll(editorial) : 10;
  return doc.kapitel.length >= soll;
}
