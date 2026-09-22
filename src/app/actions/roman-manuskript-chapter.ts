"use server";

/**
 * Single-chapter Manuskript actions: Erzeugen / Verbessern / Gegenlesen.
 * Clever: Verbessern = Analyze → Dialog → Apply / Fertig (OK).
 */

import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  analyzeCleverGeschichteVerbessern,
  applyCleverGeschichteVerbessern,
  critiqueManuskriptChapter,
  generateManuskriptChapter,
  improveManuskriptChapter,
  markCleverGeschichteFertig,
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
  revalidateRomanAdmin(romanId);
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

/** Clever: Leser analyzes one Kurzgeschichte → plan for the improve dialog. */
export async function romanCleverGeschichteAnalyzeAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    plan: import("@/lib/roman/editorial").RomanReifegradImprovePlan;
    summary: string;
    runId: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await analyzeCleverGeschichteVerbessern(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kurzgeschichte analysieren fehlgeschlagen.",
    };
  }
}

/** Clever: apply stored Verbessern plan (Erzähler patch). */
export async function romanCleverGeschichteApplyAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
    chapterNumber: number;
    runId: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await applyCleverGeschichteVerbessern(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kurzgeschichte einarbeiten fehlgeschlagen.",
    };
  }
}

/** Clever: mark Kurzgeschichte OK (Fertig) and clear open Verbessern plan. */
export async function romanCleverGeschichteFertigAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    summary: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await markCleverGeschichteFertig(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fertig markieren fehlgeschlagen.",
    };
  }
}
