"use server";

/**
 * Admin actions for Buch CRUD, cover, and front matter.
 * Vertical pipeline KI lives in `roman-pipeline.ts` and stage suggest actions.
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { generateRomanCover } from "@/lib/roman/cover";
import {
  emptyRomanEditorial,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { generateRomanFrontMatter } from "@/lib/roman/front-matter";
import {
  generateRomanMarketingCopy,
  marketingCopySourceFromRoman,
} from "@/lib/roman/marketing-copy";
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
import {
  firstZodMessage,
  romanCoverGenerateSchema,
  romanCoverSaveSchema,
  romanFrontMatterGenerateSchema,
  romanFrontMatterSaveSchema,
  romanIdSchema,
  romanMarketingCopyGenerateSchema,
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
  revalidatePath("/admin/roman");
  if (romanId) revalidatePath(`/admin/roman/${romanId}`);
}

/**
 * List only — do not refresh the open `/admin/roman/[id]` workspace.
 * Detail revalidation remounts RSC props and jumps the scroll after Speichern.
 */
function revalidateRomanListOnly() {
  revalidatePath("/admin/roman");
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

    const result = await generateRomanCover({
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
      error: firstZodMessage(parsed.error),
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
      error: firstZodMessage(parsed.error, "Ungültige ID."),
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

/**
 * Gemini: Klappentext (Amazon-Beschreibung) + Einzeiler (Untertitel / Eyecatcher).
 */
export async function generateRomanMarketingCopyAction(
  input: unknown,
): Promise<
  ActionResult<{
    klappentext: string;
    einzeiler: string;
    roman: RomanKontext;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanMarketingCopyGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }
    const source = marketingCopySourceFromRoman(roman);
    const copy = await generateRomanMarketingCopy(source);
    const editorial: RomanEditorial = {
      ...(roman.editorial as RomanEditorial),
      klappentext: copy.klappentext,
      einzeiler: copy.einzeiler,
    };
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
      editorial,
    });
    revalidateRoman(parsed.data.romanId);
    return {
      success: true,
      data: {
        klappentext: copy.klappentext,
        einzeiler: copy.einzeiler,
        roman: saved,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Marketing-Text fehlgeschlagen.",
    };
  }
}
