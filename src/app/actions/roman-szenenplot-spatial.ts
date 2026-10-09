"use server";

/**
 * Enrich Ort/Etage/Prop-Ablage on an existing Szenenplot (legacy catch-up).
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import {
  enrichSzenenplotSpatialContinuity,
  szenenplotNeedsSpatialEnrichment,
} from "@/lib/roman/enrich-szenenplot-spatial";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { freezeSzenenplotSchreibPrompts } from "@/lib/roman/suggest-szenenplot-detail";
import type { ActionResult } from "@/lib/types/actions";
import type { RomanKontext } from "@/lib/roman/types";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  /** Also freeze schreibPrompts (Szenenplot Fertig). */
  freeze: z.boolean().optional(),
  /** Force re-enrich even if already marked enriched. */
  force: z.boolean().optional(),
});

/**
 * Nachschärfen der räumlichen Continuity; optional Freeze für Manuskript.
 */
export async function enrichSzenenplotSpatialAction(
  raw: z.infer<typeof schema>,
): Promise<ActionResult<{ roman: RomanKontext; enriched: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  const roman = await getRomanKontext(parsed.data.romanId);
  if (!roman) {
    return { success: false, error: "Roman nicht gefunden." };
  }

  const editorial = roman.editorial ?? emptyRomanEditorial();
  let structured = editorial.szenenplotStructured;
  if (!structured?.chapters.length) {
    return { success: false, error: "Kein Szenenplot vorhanden." };
  }

  let enriched = false;
  if (
    parsed.data.force ||
    szenenplotNeedsSpatialEnrichment(structured) ||
    !structured.spatialContinuityEnrichedAt
  ) {
    structured = await enrichSzenenplotSpatialContinuity(structured);
    enriched = true;
  }

  if (parsed.data.freeze) {
    structured = freezeSzenenplotSchreibPrompts(structured);
  }

  const saved = await upsertRomanKontext({
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
    editorial: {
      ...editorial,
      szenenplotStructured: structured,
    },
  });

  revalidateRomanAdmin(roman.id);
  return {
    success: true,
    data: { roman: saved, enriched },
  };
}
