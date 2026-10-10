"use server";

/**
 * Kontinuitäts-Pass: Canon prüfen + hart einarbeiten
 * (Kapitelgerüst / Szenenplot / Manuskript).
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import {
  applyManuskriptContinuityFixes,
  continuitySourceText,
  editorialAfterContinuityApply,
  scanManuskriptContinuity,
  type ContinuityFix,
  type ContinuityTarget,
} from "@/lib/roman/manuskript-continuity-pass";
import {
  getRomanKontext,
  setRomanEditorial,
  upsertRomanKontext,
} from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const targetSchema = z.enum(["kapitelgeruest", "szenenplot", "manuskript"]);

const idSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  target: targetSchema.default("manuskript"),
});

const fixSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["mass", "identity", "name"]),
  chapter: z.number().int().min(0),
  find: z.string().min(1),
  replace: z.string().min(1),
  reason: z.string(),
  nearHint: z.string().optional(),
});

const applySchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  target: targetSchema.default("manuskript"),
  fixes: z.array(fixSchema).min(1).max(80),
});

function emptyError(target: ContinuityTarget): string {
  if (target === "kapitelgeruest") {
    return "Kein Gerüst-Text — zuerst Grob-/Feingerüst erzeugen.";
  }
  if (target === "szenenplot") {
    return "Kein Szenenplot — zuerst Grob-/Feinplot erzeugen.";
  }
  return "Kein Manuskript-Text — zuerst Kapitel erzeugen.";
}

/**
 * Scan stage text vs Wissensgraph for Canon drifts (no writes).
 */
export async function romanManuskriptContinuityScanAction(
  input: unknown,
): Promise<
  ActionResult<{
    summary: string;
    fixes: ContinuityFix[];
    target: ContinuityTarget;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const target = parsed.data.target;
    const roman = await getRomanKontext(parsed.data.romanId, {
      omitCover: true,
    });
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const source = continuitySourceText({
      target,
      manuskriptText: editorial.manuskriptText,
      kapitelGeruestRaw: editorial.kapitelGeruestRaw,
      manuskriptRaw: roman.manuskriptRaw,
    });
    if (source.length < 40) {
      return { success: false, error: emptyError(target) };
    }

    const result = await scanManuskriptContinuity({
      sourceText: source,
      target,
      wissensGraph: editorial.wissensGraph,
      charaktere: roman.charaktere,
    });

    return {
      success: true,
      data: {
        summary: result.summary,
        fixes: result.fixes,
        target,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kontinuitäts-Prüfung fehlgeschlagen.",
    };
  }
}

/**
 * Hard-apply selected continuity fixes to the stage artifact (+ graph sync).
 */
export async function romanManuskriptContinuityApplyAction(
  input: unknown,
): Promise<
  ActionResult<{
    appliedCount: number;
    appliedIds: string[];
    roman: RomanKontext;
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

  try {
    const target = parsed.data.target;
    const roman = await getRomanKontext(parsed.data.romanId, {
      omitCover: true,
    });
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const source = continuitySourceText({
      target,
      manuskriptText: editorial.manuskriptText,
      kapitelGeruestRaw: editorial.kapitelGeruestRaw,
      manuskriptRaw: roman.manuskriptRaw,
    });
    if (source.length < 40) {
      return { success: false, error: emptyError(target) };
    }

    const result = applyManuskriptContinuityFixes({
      sourceText: source,
      docFormat: target === "manuskript" ? "manuskript" : "plot",
      wissensGraph: editorial.wissensGraph,
      fixes: parsed.data.fixes,
    });

    if (result.appliedCount < 1) {
      return {
        success: false,
        error:
          "Keine Ersetzung gegriffen — Text weicht vom Scan ab (Seite neu laden und erneut prüfen).",
      };
    }

    const appliedFixes = parsed.data.fixes.filter((f) =>
      result.appliedIds.includes(f.id),
    );
    const nextEd = editorialAfterContinuityApply(editorial, {
      target,
      text: result.text,
      wissensGraph: result.wissensGraph,
      appliedFixes,
    });

    let savedRoman: RomanKontext;
    if (target === "szenenplot") {
      savedRoman = await upsertRomanKontext({
        id: roman.id,
        title: roman.title,
        manuskriptRaw: result.text,
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
        editorial: nextEd,
      });
    } else {
      const ok = await setRomanEditorial(roman.id, nextEd);
      if (!ok) {
        return { success: false, error: "Speichern fehlgeschlagen." };
      }
      const refreshed = await getRomanKontext(roman.id, { omitCover: true });
      savedRoman = refreshed
        ? { ...refreshed, coverImageDataUrl: roman.coverImageDataUrl }
        : { ...roman, editorial: nextEd };
    }

    revalidateRomanAdmin(roman.id);

    return {
      success: true,
      data: {
        appliedCount: result.appliedCount,
        appliedIds: result.appliedIds,
        roman: {
          ...savedRoman,
          coverImageDataUrl:
            savedRoman.coverImageDataUrl || roman.coverImageDataUrl,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kontinuität einarbeiten fehlgeschlagen.",
    };
  }
}
