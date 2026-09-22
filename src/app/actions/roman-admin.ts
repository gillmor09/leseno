"use server";

/**
 * Admin actions for Buch CRUD, cover, and front matter.
 * Vertical pipeline KI lives in `roman-pipeline.ts` and stage suggest actions.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { generateCleverCover } from "@/lib/roman/clever-cover";
import { generateRomanCover } from "@/lib/roman/cover";
import {
  clearPendingRomanCover,
  stashPendingRomanCover,
  takePendingRomanCover,
} from "@/lib/roman/cover-pending";
import { generateRomanFrontMatter } from "@/lib/roman/front-matter";
import type { RomanEditorial } from "@/lib/roman/editorial";
import {
  clearRomanCover,
  deleteRoman,
  getRomanKontext,
  setRomanCover,
  setRomanFrontMatter,
  upsertRomanKontext,
} from "@/lib/roman/repository";
import type {
  RomanCharakter,
  RomanKontext,
  RomanSzenenRasterItem,
} from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";
import { revalidateRomanAdmin, revalidateRomanAdminLists } from "@/lib/roman/revalidate-admin";
import {
  firstZodMessage,
  romanCoverGenerateSchema,
  romanCoverSaveSchema,
  romanFrontMatterGenerateSchema,
  romanFrontMatterSaveSchema,
  romanIdSchema,
  romanUpsertSchema,
} from "@/lib/validations/roman-admin";

function toUpsertInput(data: z.infer<typeof romanUpsertSchema>) {
  return {
    id: data.id,
    title: data.title,
    manuskriptRaw: data.manuskriptRaw,
    stilbibel: data.stilbibel,
    genre: data.genre,
    praemisse: data.praemisse,
    perspektive: data.perspektive,
    zeitform: data.zeitform,
    tonalitaet: data.tonalitaet,
    charaktere: data.charaktere as RomanCharakter[],
    weltSchauplaetze: data.weltSchauplaetze,
    weltRegeln: data.weltRegeln,
    szenenRaster: data.szenenRaster as RomanSzenenRasterItem[],
    kiRegelwerk: data.kiRegelwerk,
    fanPersonaName: data.fanPersonaName,
    fanPersonaProfil: data.fanPersonaProfil,
    editorial: data.editorial as RomanEditorial | undefined,
  };
}

function revalidateRoman(romanId?: string) {
  revalidateRomanAdmin(romanId);
}

/**
 * List only — do not refresh the open workspace detail.
 * Detail revalidation remounts RSC props and jumps the scroll after Speichern.
 */
function revalidateRomanListOnly() {
  revalidateRomanAdminLists();
}

/** Save kontext without regenerating the roadmap. */
export async function saveRomanKontextAction(
  input: unknown,
): Promise<ActionResult<{ roman: RomanKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error),
    };
  }

  try {
    const roman = await upsertRomanKontext(toUpsertInput(parsed.data));
    revalidateRomanListOnly();
    return { success: true, data: { roman } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern fehlgeschlagen.",
    };
  }
}

/** Delete a roman and cascading scenes. */
export async function deleteRomanAction(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error, "Ungültige ID."),
    };
  }

  try {
    const deleted = await deleteRoman(parsed.data.romanId);
    revalidateRoman();
    return { success: true, data: { deleted } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
    };
  }
}

/**
 * Cover generate: Roman pipeline, or Clever (roles + logo overlays) when buchTyp is clever_erzaehlt.
 */
export async function generateRomanCoverAction(
  input: unknown,
): Promise<
  ActionResult<{
    dataUrl: string;
    sceneDescription: string;
    promptUsed: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanCoverGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error),
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }

    const ed = roman.editorial;
    const alterLabel =
      ed?.zielAlterMin != null || ed?.zielAlterMax != null
        ? ed.zielAlterMin != null && ed.zielAlterMax != null
          ? `${ed.zielAlterMin}–${ed.zielAlterMax} Jahre`
          : ed.zielAlterMin != null
            ? `ab ${ed.zielAlterMin} Jahre`
            : `bis ${ed.zielAlterMax} Jahre`
        : "";

    const coverInput = {
      title: roman.title,
      genre: roman.genre,
      praemisse: roman.praemisse,
      tonalitaet: roman.tonalitaet,
      weltSchauplaetze: roman.weltSchauplaetze,
      charaktere: roman.charaktere,
      manuskriptRaw: roman.manuskriptRaw,
      manuskriptText: ed?.manuskriptText ?? "",
      ideeKurz: ed?.ideeKurz ?? "",
      alterLabel,
      extraInstruction: parsed.data.extraInstruction,
    };

    const result =
      ed?.buchTyp === "clever_erzaehlt"
        ? await generateCleverCover(coverInput)
        : await generateRomanCover(coverInput);

    stashPendingRomanCover({
      romanId: parsed.data.romanId,
      dataUrl: result.dataUrl,
      prompt: result.promptUsed,
    });

    return {
      success: true,
      data: {
        dataUrl: result.dataUrl,
        sceneDescription: result.sceneDescription,
        promptUsed: result.promptUsed,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover-Generierung fehlgeschlagen.",
    };
  }
}

/** Persist pending cover (from generate stash) — no multi-MB client upload. */
export async function saveRomanCoverAction(
  input: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanCoverSaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error),
    };
  }

  try {
    const pending = takePendingRomanCover(parsed.data.romanId);
    if (!pending?.dataUrl) {
      return {
        success: false,
        error:
          "Keine Cover-Vorschau zum Speichern — bitte Cover zuerst neu erzeugen.",
      };
    }
    const saved = await setRomanCover({
      id: parsed.data.romanId,
      coverImageDataUrl: pending.dataUrl,
      coverPrompt: parsed.data.coverPrompt?.trim() || pending.prompt,
    });
    // Lists only — do not remount the open workspace with a multi-MB RSC payload.
    revalidateRomanListOnly();
    return { success: true, data: { saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover speichern fehlgeschlagen.",
    };
  }
}

/** Remove cover image + prompt. */
export async function clearRomanCoverAction(
  input: unknown,
): Promise<ActionResult<{ cleared: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error, "Ungültige ID."),
    };
  }

  try {
    clearPendingRomanCover(parsed.data.romanId);
    const cleared = await clearRomanCover(parsed.data.romanId);
    revalidateRomanListOnly();
    return { success: true, data: { cleared } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover löschen fehlgeschlagen.",
    };
  }
}

/**
 * Gemini designs Buchrücken + minimal eBook Vorsatz from manuscript/summary.
 */
export async function generateRomanFrontMatterAction(
  input: unknown,
): Promise<
  ActionResult<{
    autorName: string;
    buchruecken: RomanKontext["buchruecken"];
    vorsatz: RomanKontext["vorsatz"];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanFrontMatterGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error),
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }

    const result = await generateRomanFrontMatter({
      title: roman.title,
      autorName: roman.autorName,
      genre: roman.genre,
      praemisse: roman.praemisse,
      tonalitaet: roman.tonalitaet,
      manuskriptRaw: roman.manuskriptRaw,
      aktuelleZusammenfassung: roman.aktuelleZusammenfassung,
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Buchrücken/Vorsatz-Generierung fehlgeschlagen.",
    };
  }
}

/** Persist Buchrücken + Vorsatz. */
export async function saveRomanFrontMatterAction(
  input: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanFrontMatterSaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: firstZodMessage(parsed.error),
    };
  }

  try {
    const saved = await setRomanFrontMatter({
      id: parsed.data.romanId,
      autorName: parsed.data.autorName,
      buchruecken: parsed.data.buchruecken,
      vorsatz: parsed.data.vorsatz,
    });
    revalidateRoman(parsed.data.romanId);
    return { success: true, data: { saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Buchrücken/Vorsatz speichern fehlgeschlagen.",
    };
  }
}
