"use server";

/**
 * Basics Vorab: Marktanalyse (Gemini + Google Search) — persists on editorial.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  normalizeRichtungen,
  type RomanBuchTyp,
  type RomanMarktanalyse,
} from "@/lib/roman/editorial";
import { runMarktanalyseScan } from "@/lib/roman/market-scan";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const scanSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  genre: z
    .string()
    .trim()
    .min(2, { message: "Genre wählen." })
    .max(120),
  alterPresetId: z
    .string()
    .trim()
    .min(1, { message: "Altersgruppe wählen." })
    .max(80),
  richtungen: z.array(z.string().max(40)).max(2).optional().default([]),
});

/**
 * Runs competitive market scan and stores result on editorial.marktanalyse.
 */
export async function romanMarktanalyseScanAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; marktanalyse: RomanMarktanalyse }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    const buchTyp = (editorial.buchTyp ?? "unbekannt") as RomanBuchTyp;
    if (!isBuchTypSet(buchTyp)) {
      return { success: false, error: "Zuerst Buchtyp wählen." };
    }

    const richtungen = normalizeRichtungen(parsed.data.richtungen);
    const marktanalyse = await runMarktanalyseScan({
      buchTyp,
      genre: parsed.data.genre,
      alterPresetId: parsed.data.alterPresetId,
      richtungen,
      zielAlterMin: editorial.zielAlterMin,
      zielAlterMax: editorial.zielAlterMax,
      lesestufe: editorial.lesestufe,
    });

    const nextEditorial = {
      ...editorial,
      richtungen,
      marktanalyse,
    };
    const saved = await upsertRomanKontext({
      id: roman.id,
      title: roman.title,
      manuskriptRaw: roman.manuskriptRaw,
      stilbibel: roman.stilbibel,
      genre: parsed.data.genre.trim() || roman.genre,
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
      editorial: nextEditorial,
    });

    revalidatePath("/admin/roman");
    revalidatePath(`/admin/roman/${roman.id}`);

    return {
      success: true,
      data: {
        roman: { ...saved, ideenChat: roman.ideenChat },
        marktanalyse,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Marktanalyse fehlgeschlagen.",
    };
  }
}
