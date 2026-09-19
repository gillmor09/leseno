"use server";

/**
 * Manuskript Vereinfachen + Original wiederherstellen.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import {
  restoreManuskriptOriginal,
  vereinfacheManuskript,
} from "@/lib/roman/manuskript-vereinfachen";
import { getRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
});

/**
 * Snapshot original (once) + rewrite all chapters one register step easier.
 */
export async function romanManuskriptVereinfachenAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
    originalSaved: boolean;
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

    const result = await vereinfacheManuskript({ roman });
    revalidatePath("/admin/roman");
    revalidatePath(`/admin/roman/${roman.id}`);
    return {
      success: true,
      data: {
        roman: result.roman,
        summary: result.summary,
        originalSaved: result.originalSaved,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Vereinfachen fehlgeschlagen.",
    };
  }
}

/**
 * Restore manuskriptText from manuskriptOriginalText.
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
    revalidatePath("/admin/roman");
    revalidatePath(`/admin/roman/${roman.id}`);
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
          : "Wiederherstellen fehlgeschlagen.",
    };
  }
}
