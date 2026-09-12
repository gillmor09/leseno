"use server";

/**
 * Admin actions for the novel writing pipeline (Gemini + Supabase).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { generateRomanCover } from "@/lib/roman/cover";
import { generateRomanFrontMatter } from "@/lib/roman/front-matter";
import { runRomanPhase0 } from "@/lib/roman/phase0";
import { processNextRomanSzene } from "@/lib/roman/process-scene";
import {
  clearRomanCover,
  deleteRoman,
  getRomanKontext,
  listRomanKontexte,
  listSzenen,
  resetSzeneToReady,
  setRomanCover,
  setRomanFrontMatter,
  upsertRomanKontext,
} from "@/lib/roman/repository";
import type {
  RomanKontext,
  RomanKontextSummary,
  Szene,
} from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  romanCoverGenerateSchema,
  romanCoverSaveSchema,
  romanFrontMatterGenerateSchema,
  romanFrontMatterSaveSchema,
  romanIdSchema,
  romanPhase0Schema,
  romanUpsertSchema,
  szeneIdSchema,
} from "@/lib/validations/roman-admin";

function toUpsertInput(
  data: ReturnType<typeof romanUpsertSchema.parse>,
) {
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
    charaktere: data.charaktere,
    weltSchauplaetze: data.weltSchauplaetze,
    weltRegeln: data.weltRegeln,
    szenenRaster: data.szenenRaster,
    kiRegelwerk: data.kiRegelwerk,
    fanPersonaName: data.fanPersonaName,
    fanPersonaProfil: data.fanPersonaProfil,
  };
}

function revalidateRoman(romanId?: string) {
  revalidatePath("/admin/roman");
  if (romanId) revalidatePath(`/admin/roman/${romanId}`);
}

export async function loadRomanAdminListAction(): Promise<
  ActionResult<{ romane: RomanKontextSummary[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  try {
    const romane = await listRomanKontexte();
    return { success: true, data: { romane } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Romane laden fehlgeschlagen.",
    };
  }
}

export async function loadRomanWorkspaceAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; szenen: Szene[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }
    const szenen = await listSzenen(roman.id);
    return { success: true, data: { roman, szenen } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Roman laden fehlgeschlagen.",
    };
  }
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
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const roman = await upsertRomanKontext(toUpsertInput(parsed.data));
    revalidateRoman(roman.id);
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

/**
 * Phase 0: save foundation/manuscript + Gemini scene roadmap.
 * Long-running — keep one roman per call. Entry open (manuscript and/or fundament).
 */
export async function runRomanPhase0Action(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; szenenCount: number }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanPhase0Schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const result = await runRomanPhase0(toUpsertInput(parsed.data));
    revalidateRoman(result.roman.id);
    return {
      success: true,
      data: { roman: result.roman, szenenCount: result.szenenCount },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Szenen-Roadmap fehlgeschlagen.",
    };
  }
}

/**
 * Phase 1–3 for the next READY scene (one scene per invocation).
 */
export async function processNextRomanSzeneAction(
  input: unknown,
): Promise<
  ActionResult<{
    done: boolean;
    szene: Szene | null;
    message: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const result = await processNextRomanSzene(parsed.data.romanId);
    revalidateRoman(parsed.data.romanId);
    if (!result) {
      return {
        success: true,
        data: {
          done: true,
          szene: null,
          message: "Keine Szene mehr mit Status READY_FOR_WRITING.",
        },
      };
    }
    return {
      success: true,
      data: {
        done: false,
        szene: result.szene,
        message: `Szene Kap. ${result.szene.kapitelNr}/${result.szene.szenenNr} abgeschlossen.`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Szenen-Pipeline fehlgeschlagen.",
    };
  }
}

export async function resetRomanSzeneAction(
  input: unknown,
): Promise<ActionResult<{ reset: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = szeneIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const reset = await resetSzeneToReady(parsed.data.szeneId);
    revalidatePath("/admin/roman");
    return { success: true, data: { reset } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Reset fehlgeschlagen.",
    };
  }
}

export async function deleteRomanAction(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
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
 * Admin PDF upload → plain text for `manuskript_raw` (Stilbibel stays separate).
 */
export async function extractRomanPdfAction(
  formData: FormData,
): Promise<
  ActionResult<{ text: string; pageCount: number; fileName: string }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Keine PDF-Datei übergeben." };
  }

  const name = file.name || "manuskript.pdf";
  const isPdf =
    file.type === "application/pdf" ||
    name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return { success: false, error: "Bitte eine PDF-Datei wählen." };
  }

  try {
    const { extractTextFromPdfBuffer } = await import(
      "@/lib/roman/extract-pdf-text"
    );
    const buffer = await file.arrayBuffer();
    const { text, pageCount } = await extractTextFromPdfBuffer(buffer);
    return {
      success: true,
      data: { text, pageCount, fileName: name },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "PDF konnte nicht gelesen werden.",
    };
  }
}

/**
 * Gemini scene brief → Flux cover (returns data URL; persist via save).
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
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }

    const result = await generateRomanCover({
      title: roman.title,
      genre: roman.genre,
      praemisse: roman.praemisse,
      tonalitaet: roman.tonalitaet,
      weltSchauplaetze: roman.weltSchauplaetze,
      charaktere: roman.charaktere,
      manuskriptRaw: roman.manuskriptRaw,
      extraInstruction: parsed.data.extraInstruction,
      skipTitleOverlay: parsed.data.skipTitleOverlay,
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

/** Persist cover on the roman row. */
export async function saveRomanCoverAction(
  input: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanCoverSaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const saved = await setRomanCover({
      id: parsed.data.romanId,
      coverImageDataUrl: parsed.data.coverImageDataUrl,
      coverPrompt: parsed.data.coverPrompt,
    });
    revalidateRoman(parsed.data.romanId);
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
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const cleared = await clearRomanCover(parsed.data.romanId);
    revalidateRoman(parsed.data.romanId);
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
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
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
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
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
