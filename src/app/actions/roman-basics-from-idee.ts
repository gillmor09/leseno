"use server";

/**
 * Derive Basics (genre / tonality / grobRegeln / optional age) from Idee.
 * Auto after Idee Hard-Gate green when Basics empty; manual „Neu ableiten“ on Basics tab.
 */

import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  ROMAN_ALTER_PRESETS,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import { basicsLookEmptyForAutoDerive } from "@/lib/roman/fill-checks";
import { suggestBasicsFromIdee } from "@/lib/roman/suggest-basics-from-idee";
import { evaluateStageHardGate } from "@/lib/roman/stage-hard-gates";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
} from "@/lib/roman/pipeline/history";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const deriveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  /** When true, skip empty-check (manual „Neu ableiten“). */
  force: z.boolean().optional().default(false),
});

/** Map KI age band onto nearest Alters-Preset when possible. */
function nearestAlterPresetApply(
  min: number | null,
  max: number | null,
): Partial<{
  zielAlterMin: number | null;
  zielAlterMax: number | null;
  lesestufe: string;
}> {
  if (min == null && max == null) return {};
  let best = ROMAN_ALTER_PRESETS[0]!;
  let bestDiff = Infinity;
  for (const p of ROMAN_ALTER_PRESETS) {
    const pMin = p.apply.zielAlterMin ?? 0;
    const pMax = p.apply.zielAlterMax ?? 99;
    const dMin = min != null ? Math.abs(pMin - min) : 0;
    const dMax = max != null ? Math.abs(pMax - (max ?? pMax)) : 0;
    const d = dMin + dMax;
    if (d < bestDiff) {
      bestDiff = d;
      best = p;
    }
  }
  return {
    zielAlterMin: min ?? best.apply.zielAlterMin ?? null,
    zielAlterMax: max ?? best.apply.zielAlterMax ?? null,
    ...(best.apply.lesestufe ? { lesestufe: best.apply.lesestufe } : {}),
  };
}

/**
 * Persist KI-derived Basics onto roman + editorial; log history event.
 */
export async function romanDeriveBasicsFromIdeeAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    begruendung: string;
    auto: boolean;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = deriveSchema.safeParse(input);
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

    const ideeGate = evaluateStageHardGate({
      stage: "idee",
      editorial,
      tonalitaet: roman.tonalitaet,
      genre: roman.genre,
    });
    if (!ideeGate.ok) {
      return {
        success: false,
        error: `Idee-Hard-Gate noch rot — zuerst Idee ausarbeiten. ${ideeGate.summary}`,
      };
    }

    const empty = basicsLookEmptyForAutoDerive({
      genre: roman.genre,
      tonalitaet: roman.tonalitaet,
      editorial,
    });
    if (!parsed.data.force && !empty) {
      return {
        success: false,
        error:
          "Basics sind schon gefüllt — nutze „Neu aus Idee ableiten“ (mit Bestätigung).",
      };
    }

    const suggested = await suggestBasicsFromIdee({
      buchTyp,
      title: roman.title,
      ideeKurz: editorial.ideeKurz ?? "",
      existingGenre: roman.genre,
      existingTonalitaet: roman.tonalitaet,
      existingGrobRegeln: editorial.grobRegeln,
      existingAlterMin: editorial.zielAlterMin,
      existingAlterMax: editorial.zielAlterMax,
    });

    const agePatch = nearestAlterPresetApply(
      suggested.zielAlterMin,
      suggested.zielAlterMax,
    );
    const now = new Date().toISOString();
    const nextEditorial = {
      ...editorial,
      grobRegeln: suggested.grobRegeln,
      ...agePatch,
      basicsDerivedFromIdeeAt: now,
      basicsDerivedIdeeFingerprint: suggested.ideeFingerprint,
      basicsDerivedBegruendung: suggested.begruendung,
    };

    const saved = await upsertRomanKontext({
      id: roman.id,
      title: roman.title,
      manuskriptRaw: roman.manuskriptRaw,
      stilbibel: roman.stilbibel,
      genre: suggested.genre,
      praemisse: roman.praemisse,
      perspektive: roman.perspektive,
      zeitform: roman.zeitform,
      tonalitaet: suggested.tonalitaet,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenRaster: roman.szenenRaster,
      kiRegelwerk: roman.kiRegelwerk,
      fanPersonaName: roman.fanPersonaName,
      fanPersonaProfil: roman.fanPersonaProfil,
      editorial: nextEditorial,
    });

    const event = historyEvent({
      type: "info",
      stage: "idee",
      summary: parsed.data.force
        ? `Basics neu aus Idee abgeleitet (${suggested.modelLabel})`
        : `Basics automatisch aus Idee abgeleitet (${suggested.modelLabel})`,
      detail: [
        `Genre: ${suggested.genre}`,
        suggested.begruendung,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2_000),
      modelLabel: suggested.modelLabel,
    });
    const runId = await startPipelineHistoryRun({
      romanId: roman.id,
      trigger: "basics_from_idee",
      originStage: "idee",
      firstEvent: event,
    });
    await updatePipelineHistoryRun({
      runId,
      status: "ok",
      events: [event],
    });

    revalidateRomanAdmin(roman.id);

    return {
      success: true,
      data: {
        roman: { ...saved, ideenChat: roman.ideenChat },
        begruendung: suggested.begruendung,
        auto: !parsed.data.force,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Basics-Ableitung fehlgeschlagen.",
    };
  }
}
