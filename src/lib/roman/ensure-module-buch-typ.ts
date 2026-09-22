/**
 * Ensure a roman’s editorial.buchTyp matches the admin module (server-side).
 */

import {
  emptyRomanEditorial,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import { upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";

/**
 * Persist module buchTyp when missing or mismatched (e.g. legacy „unbekannt“).
 */
export async function ensureRomanModuleBuchTyp(
  roman: RomanKontext,
  buchTyp: Exclude<RomanBuchTyp, "unbekannt" | "serie_welt">,
): Promise<RomanKontext> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp === buchTyp) return roman;

  return upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: { ...editorial, buchTyp },
  });
}
