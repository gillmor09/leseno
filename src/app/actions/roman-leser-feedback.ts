"use server";

/**
 * Idee / Spec / Kapitelgerüst / Manuskript: Testleser Leser-Feedback — generate + persist + apply.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  isLeserFeedbackStage,
  leserFeedbackForStage,
  withLeserFeedbackForStage,
  type LeserFeedbackStage,
  type RomanBuchTyp,
  type RomanLeserFeedback,
} from "@/lib/roman/editorial";
import { applyLeserFeedbackToStage } from "@/lib/roman/leser-feedback-apply";
import { collectStageLeserFeedback } from "@/lib/roman/leser-feedback-collect";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  stage: z
    .enum(["idee", "expose", "szenenplot", "manuskript"])
    .default("manuskript"),
});

const applySchema = schema.extend({
  autorEntscheidungen: z.record(z.string(), z.string().max(4_000)).optional(),
});

/**
 * Runs Testleser against Idee / Spec / Kapitelgerüst / Manuskript and stores feedback.
 */
export async function romanLeserFeedbackAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; feedback: RomanLeserFeedback }>
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

  const stage = parsed.data.stage as LeserFeedbackStage;
  if (!isLeserFeedbackStage(stage)) {
    return { success: false, error: "Ungültige Stufe." };
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

    const feedback = await collectStageLeserFeedback({ roman, stage });

    const nextEditorial = withLeserFeedbackForStage(
      editorial,
      stage,
      feedback,
    );
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
      editorial: nextEditorial,
    });

    revalidatePath("/admin/roman");
    revalidatePath(`/admin/roman/${roman.id}`);

    return {
      success: true,
      data: {
        roman: { ...saved, ideenChat: roman.ideenChat },
        feedback,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Leser-Feedback fehlgeschlagen.",
    };
  }
}

/**
 * Applies stored Leser-Feedback for a stage (Idee / Spec / Kapitelgerüst / Manuskript).
 */
export async function romanLeserFeedbackApplyAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
    patchedChapters: number[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  const stage = parsed.data.stage as LeserFeedbackStage;
  const autorEntscheidungen = parsed.data.autorEntscheidungen
    ? Object.fromEntries(
        Object.entries(parsed.data.autorEntscheidungen).map(([k, v]) => [
          Number(k),
          v,
        ]),
      )
    : undefined;

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (!leserFeedbackForStage(editorial, stage)) {
      return { success: false, error: "Kein gespeichertes Leser-Feedback." };
    }

    const result = await applyLeserFeedbackToStage({
      roman,
      stage,
      autorEntscheidungen,
    });

    revalidatePath("/admin/roman");
    revalidatePath(`/admin/roman/${roman.id}`);

    return {
      success: true,
      data: {
        roman: { ...result.roman, ideenChat: roman.ideenChat },
        summary: result.summary,
        patchedChapters: result.patchedChapters,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Einarbeiten des Leser-Feedbacks fehlgeschlagen.",
    };
  }
}
