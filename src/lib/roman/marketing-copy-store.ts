/**
 * Verkaufstexte source + patch via public RPCs (service role, schema null).
 * Direct `.from("roman_kontext")` on schema `leseno` fails with "Invalid schema".
 */

import {
  emptyRomanEditorial,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  getRomanKontext,
  setRomanEditorial,
} from "@/lib/roman/repository";
import type { RomanCharakter } from "@/lib/roman/types";

export type RomanMarketingSourceRow = {
  id: string;
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  charaktere: RomanCharakter[];
  manuskriptRaw: string;
  editorial: RomanEditorial;
};

/**
 * Load book materials for Verkaufstexte (cover bytes stripped after RPC).
 */
export async function getRomanMarketingSource(
  id: string,
): Promise<RomanMarketingSourceRow | null> {
  const roman = await getRomanKontext(id, { omitCover: true });
  if (!roman) return null;
  return {
    id: roman.id,
    title: roman.title,
    genre: roman.genre,
    praemisse: roman.praemisse,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    manuskriptRaw: roman.manuskriptRaw,
    editorial: roman.editorial ?? emptyRomanEditorial(),
  };
}

/**
 * Merge only marketing fields into editorial via admin_set_roman_editorial.
 */
export async function patchRomanMarketingCopy(input: {
  id: string;
  klappentext: string;
  einzeiler: string;
  amazonKeywords: string[];
}): Promise<void> {
  const roman = await getRomanKontext(input.id, { omitCover: true });
  if (!roman) throw new Error("Roman nicht gefunden.");

  const editorial: RomanEditorial = {
    ...(roman.editorial ?? emptyRomanEditorial()),
    klappentext: input.klappentext.slice(0, 4_000),
    einzeiler: input.einzeiler.slice(0, 120),
    amazonKeywords: input.amazonKeywords
      .map((k) => k.trim().slice(0, 50))
      .filter((k) => k.length >= 2)
      .slice(0, 7),
  };
  await setRomanEditorial(roman.id, editorial);
}
