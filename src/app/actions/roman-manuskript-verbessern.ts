"use server";

/**
 * Manuskript Verbessern (Autor / Opus via Claude Batch) + Original wiederherstellen.
 * Verbessern starten: Snapshot + History-Run; Arbeit läuft in
 * `/api/admin/roman/manuskript-verbessern-job` (`after`).
 */

import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import {
  restoreManuskriptOriginal,
  startManuskriptVerbessern,
} from "@/lib/roman/manuskript-verbessern";
import { getRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
});

/**
 * Seed Roman chapter slots + open history run for Claude Batch Verbessern.
 * Writes polished prose to `editorial.romanText` (Manuskript stays draft).
 * Client must kick the job API and poll progress.
 */
export async function romanManuskriptVerbessernAction(
  input: unknown,
): Promise<
  ActionResult<{
    runId: string;
    originalSaved: boolean;
    chapterCount: number;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
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

    const result = await startManuskriptVerbessern({ roman });
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: {
        runId: result.runId,
        originalSaved: result.originalSaved,
        chapterCount: result.chapterCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verbessern fehlgeschlagen.",
    };
  }
}

/**
 * Copy Manuskript draft into romanText (reset / seed Feinschliff).
 */
export async function romanManuskriptOriginalRestoreAction(
  input: unknown,
): Promise<ActionResult<{ roman: RomanKontext; summary: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
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

    const result = await restoreManuskriptOriginal({ roman });
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: { roman: result.roman, summary: result.summary },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Übernehmen fehlgeschlagen.",
    };
  }
}
