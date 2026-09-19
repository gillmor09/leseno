"use server";

/**
 * Single-chapter Manuskript actions: Erzeugen / Verbessern / Gegenlesen.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  critiqueManuskriptChapter,
  generateManuskriptChapter,
  improveManuskriptChapter,
} from "@/lib/roman/manuskript-chapter";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  chapterNumber: z
    .number()
    .int()
    .positive({ message: "Ungültige Kapitelnummer." })
    .max(200),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Eingabe ungültig.";
}

function revalidateBook(romanId: string) {
  revalidatePath("/admin/roman");
  revalidatePath(`/admin/roman/${romanId}`);
}

/** Co-Autor schreibt / überschreibt ein Kapitel (mit Continuity). */
export async function romanManuskriptChapterGenerateAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
    chapterNumber: number;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await generateManuskriptChapter(parsed.data);
    revalidateBook(parsed.data.romanId);
    return {
      success: true,
      data: {
        roman: result.roman,
        summary: result.summary,
        chapterNumber: result.chapterNumber,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel erzeugen fehlgeschlagen.",
    };
  }
}

/** Entwicklungslektor gegenliest ein Kapitel (ohne Speichern). */
export async function romanManuskriptChapterCritiqueAction(
  input: unknown,
): Promise<
  ActionResult<{
    critiqueText: string;
    summary: string;
    chapterNumber: number;
    modelLabel: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await critiqueManuskriptChapter(parsed.data);
    revalidateBook(parsed.data.romanId);
    return {
      success: true,
      data: {
        critiqueText: result.critiqueText,
        summary: result.summary,
        chapterNumber: result.chapterNumber,
        modelLabel: result.modelLabel,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel gegenlesen fehlgeschlagen.",
    };
  }
}

/** Gegenlese + Co-Autor-Patch für ein Kapitel. */
export async function romanManuskriptChapterImproveAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
    chapterNumber: number;
    critiqueText: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await improveManuskriptChapter(parsed.data);
    revalidateBook(parsed.data.romanId);
    return {
      success: true,
      data: {
        roman: result.roman,
        summary: result.summary,
        chapterNumber: result.chapterNumber,
        critiqueText: result.critiqueText,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel verbessern fehlgeschlagen.",
    };
  }
}
