"use server";

/**
 * Sachbuch phases 1–5 server actions.
 */

import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  generateNextAbschnitt,
  replyAbschnittCheckpoint,
} from "@/lib/sachbuch/abschnitte";
import { generateSachbuchContextGraph } from "@/lib/sachbuch/context-graph";
import { runSachbuchEvidenz } from "@/lib/sachbuch/evidenz";
import { generateSachbuchKapitel } from "@/lib/sachbuch/generate-section";
import {
  runSachbuchIdeeTurn,
  sharpenSachbuchUvp,
  startSachbuchIdeeInterview,
  undoSachbuchIdeeLastTurn,
} from "@/lib/sachbuch/idee";
import {
  applyMakroToKapitel,
  generateSachbuchMakro,
} from "@/lib/sachbuch/makro";
import { slimSachbuchKontextForTransport } from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";
import { runSachbuchCoverGenerate } from "@/lib/sachbuch/export-cover";
import {
  applySachbuchSuggestedTitle,
  runSachbuchMarketingGenerate,
} from "@/lib/sachbuch/export-meta";
import {
  approveSachbuchIdeeRefine,
  rejectSachbuchIdeeRefine,
  reopenSachbuchIdeeRefine,
  runSachbuchIdeeRefine,
  setSachbuchGuideStep,
} from "@/lib/sachbuch/idee-refine";
import {
  SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS,
  approveSachbuchSchreiben,
  improveAllSachbuchManuscript,
  improveSachbuchKapitelManuscript,
  reopenSachbuchSchreiben,
  scoreSachbuchBookManuscript,
  scoreSachbuchKapitelManuscript,
} from "@/lib/sachbuch/manuscript";
import { upsertSachbuchExport } from "@/lib/sachbuch/repository";
import {
  applySachbuchBookType,
  suggestSachbuchBookType,
  type SachbuchBookTypeSuggestResult,
} from "@/lib/sachbuch/suggest-book-type";
import {
  SACHBUCH_KEYWORD_COUNT,
  type SachbuchGuideStep,
} from "@/lib/sachbuch/types";
import {
  firstSachbuchZodMessage,
  sachbuchAbschnittReplySchema,
  sachbuchApplyBookTypeSchema,
  sachbuchGenerateSchema,
  sachbuchIdeeTurnSchema,
  sachbuchIdSchema,
  sachbuchKapitelRefSchema,
} from "@/lib/validations/sachbuch";
import { z } from "zod";

async function wrap(
  sachbuchId: string,
  fn: () => Promise<SachbuchKontext>,
  fallback: string,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  try {
    const book = await fn();
    revalidateSachbuchAdmin(book.id);
    return { success: true, data: { book } };
  } catch (error) {
    revalidateSachbuchAdmin(sachbuchId);
    return {
      success: false,
      error: error instanceof Error ? error.message : fallback,
    };
  }
}

export async function startSachbuchIdeeAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(parsed.data.id, () => startSachbuchIdeeInterview(parsed.data.id), "Interview starten fehlgeschlagen.");
}

export async function sachbuchIdeeTurnAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdeeTurnSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () => runSachbuchIdeeTurn(parsed.data),
    "Interview-Antwort fehlgeschlagen.",
  );
}

export async function sharpenSachbuchUvpAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => sharpenSachbuchUvp(parsed.data.id),
    "UVP schärfen fehlgeschlagen.",
  );
}

/** Delete last Idee interview Q/A (or dangling user message). */
export async function undoSachbuchIdeeLastTurnAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => undoSachbuchIdeeLastTurn(parsed.data.id),
    "Letzte Runde löschen fehlgeschlagen.",
  );
}

/** Agentic Haiku↔Luna idea refine (2–3 rounds → awaiting_approval). */
export async function runSachbuchIdeeRefineAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => runSachbuchIdeeRefine(parsed.data.id),
    "Idee-Verfeinerung fehlgeschlagen.",
  );
}

/** HITL: approve refined dossier → unlock book_type. */
export async function approveSachbuchIdeeRefineAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => approveSachbuchIdeeRefine(parsed.data.id),
    "Idee freigeben fehlgeschlagen.",
  );
}

/** Clear refine log and allow another agentic run. */
export async function rejectSachbuchIdeeRefineAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => rejectSachbuchIdeeRefine(parsed.data.id),
    "Verfeinerung zurücksetzen fehlgeschlagen.",
  );
}

/** Revoke idea approval and reopen refine (keeps freigegebenes Konzept as basis). */
export async function reopenSachbuchIdeeRefineAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => reopenSachbuchIdeeRefine(parsed.data.id),
    "Verfeinerung öffnen fehlgeschlagen.",
  );
}

const guideStepActionSchema = z.object({
  sachbuchId: z.string().uuid(),
  step: z.enum([
    "concept",
    "refine",
    "book_type",
    "evidenz",
    "makro",
    "write",
    "manuscript",
    "herstellung",
    "export",
    "hoerbuch",
  ]),
});

/** Move wizard cursor to an unlocked step. */
export async function setSachbuchGuideStepAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = guideStepActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  // No revalidatePath — tab switch must stay light (client already owns state).
  try {
    const book = await setSachbuchGuideStep(
      parsed.data.sachbuchId,
      parsed.data.step as SachbuchGuideStep,
    );
    return { success: true, data: { book } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Schritt wechseln fehlgeschlagen.",
    };
  }
}

/** Rank gängige Sachbuchtypen against Idee/Konzept (no persist). */
export async function suggestSachbuchBookTypeAction(
  input: unknown,
): Promise<ActionResult<{ suggestion: SachbuchBookTypeSuggestResult }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  try {
    const suggestion = await suggestSachbuchBookType(parsed.data.id);
    return { success: true, data: { suggestion } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Buchtyp-Vorschlag fehlgeschlagen.",
    };
  }
}

/** Persist chosen Sachbuchtyp from catalog. */
export async function applySachbuchBookTypeAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchApplyBookTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () =>
      applySachbuchBookType({
        sachbuchId: parsed.data.sachbuchId,
        bookTypeId: parsed.data.bookTypeId,
      }),
    "Buchtyp übernehmen fehlgeschlagen.",
  );
}

export async function runSachbuchEvidenzAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => runSachbuchEvidenz(parsed.data.id),
    "Recherche fehlgeschlagen.",
  );
}

export async function generateSachbuchMakroAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => generateSachbuchMakro(parsed.data.id),
    "Makro erzeugen fehlgeschlagen.",
  );
}

export async function applyMakroToKapitelAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => applyMakroToKapitel(parsed.data.id),
    "Kapitel aus Makro erzeugen fehlgeschlagen.",
  );
}

export async function generateSachbuchContextGraphAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchKapitelRefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () => generateSachbuchContextGraph(parsed.data),
    "Context Graph erzeugen fehlgeschlagen.",
  );
}

export async function generateNextAbschnittAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchKapitelRefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  try {
    const book = await generateNextAbschnitt(parsed.data);
    revalidateSachbuchAdmin(book.id);
    return {
      success: true,
      data: {
        book: slimSachbuchKontextForTransport(book, {
          keepKapitelIds: [parsed.data.kapitelId],
        }),
      },
    };
  } catch (error) {
    revalidateSachbuchAdmin(parsed.data.sachbuchId);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Abschnitt erzeugen fehlgeschlagen.",
    };
  }
}

export async function replyAbschnittCheckpointAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchAbschnittReplySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () => replyAbschnittCheckpoint(parsed.data),
    "Checkpoint speichern fehlgeschlagen.",
  );
}

/** Optional chapter-level Critic+Style (legacy; Abschnitte run this automatically). */
export async function runSachbuchLektoratAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () =>
      generateSachbuchKapitel({
        sachbuchId: parsed.data.sachbuchId,
        kapitelId: parsed.data.kapitelId,
        fromPass: parsed.data.fromPass,
      }),
    "Lektorat fehlgeschlagen.",
  );
}

/** Generate Titel-Vorschlag, Untertitel, Klappentext, 6 Keywords + Titelei. */
export async function generateSachbuchMarketingAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => runSachbuchMarketingGenerate(parsed.data.id),
    "Marketing-Texte fehlgeschlagen.",
  );
}

/** Cover via gemini-3-pro-image → 1600×2400 JPEG. */
export async function generateSachbuchCoverAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => runSachbuchCoverGenerate(parsed.data.id),
    "Cover-Generierung fehlgeschlagen.",
  );
}

/**
 * Lazy-load cover pixels for Export preview (admin page strips the data URL).
 */
export async function getSachbuchCoverImageAction(
  input: unknown,
): Promise<
  ActionResult<{ coverImageDataUrl: string; coverPrompt: string }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  try {
    const { getSachbuchKontext } = await import(
      "@/lib/sachbuch/repository"
    );
    const book = await getSachbuchKontext(parsed.data.id);
    if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
    const url = book.export.coverImageDataUrl.trim();
    if (!url.startsWith("data:image/")) {
      return { success: false, error: "Kein Cover gespeichert." };
    }
    return {
      success: true,
      data: {
        coverImageDataUrl: url,
        coverPrompt: book.export.coverPrompt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover konnte nicht geladen werden.",
    };
  }
}

/** Apply KI title suggestion to book.title. */
export async function applySachbuchSuggestedTitleAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => applySachbuchSuggestedTitle(parsed.data.id),
    "Titel übernehmen fehlgeschlagen.",
  );
}

const saveSachbuchExportSchema = z.object({
  id: z.string().uuid(),
  suggestedTitle: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  summary: z.string().max(20_000).optional(),
  keywords: z.array(z.string().max(80)).max(SACHBUCH_KEYWORD_COUNT).optional(),
  autorName: z.string().max(200).optional(),
  motto: z.string().max(2_000).optional(),
  vorwort: z.string().max(20_000).optional(),
});

/** Persist edited marketing fields (keeps cover). */
export async function saveSachbuchExportAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = saveSachbuchExportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    async () => {
      const { getSachbuchKontext } = await import(
        "@/lib/sachbuch/repository"
      );
      const book = await getSachbuchKontext(parsed.data.id);
      if (!book) throw new Error("Sachbuch nicht gefunden.");
      const subtitle = parsed.data.subtitle ?? book.export.subtitle;
      const suggestedTitle =
        parsed.data.suggestedTitle ?? book.export.suggestedTitle;
      const autorName = parsed.data.autorName ?? book.export.autorName;
      const motto =
        parsed.data.motto ?? book.export.vorsatz.motto;
      const vorwort =
        parsed.data.vorwort ?? book.export.vorsatz.vorwort ?? "";
      const vorsatz = {
        ...book.export.vorsatz,
        titelseite: {
          ...book.export.vorsatz.titelseite,
          titel: suggestedTitle.trim() || book.title,
          untertitel: subtitle,
          autor: autorName,
        },
        motto,
        vorwort,
      };
      return upsertSachbuchExport({
        id: parsed.data.id,
        suggestedTitle,
        subtitle,
        summary: parsed.data.summary ?? book.export.summary,
        keywords: parsed.data.keywords ?? book.export.keywords,
        autorName,
        vorsatz,
      });
    },
    "Export speichern fehlgeschlagen.",
  );
}

/** Freeze Phase 5 Schreiben → Manuskript. */
export async function approveSachbuchSchreibenAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => approveSachbuchSchreiben(parsed.data.id),
    "Schreiben freigeben fehlgeschlagen.",
  );
}

/** Re-open Schreiben (clears manuscript scores). */
export async function reopenSachbuchSchreibenAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => reopenSachbuchSchreiben(parsed.data.id),
    "Schreiben wieder öffnen fehlgeschlagen.",
  );
}

/** Score one chapter for sales readiness. */
export async function scoreSachbuchKapitelManuscriptAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchKapitelRefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () => scoreSachbuchKapitelManuscript(parsed.data),
    "Manuskript-Score fehlgeschlagen.",
  );
}

/** Score the whole book as one Verkaufsreife product (not chapter mean). */
export async function scoreSachbuchBookManuscriptAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () => scoreSachbuchBookManuscript(parsed.data.id),
    "Buch-Gesamtscore fehlgeschlagen.",
  );
}

/** Improve one chapter (Argon). */
export async function improveSachbuchKapitelManuscriptAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchKapitelRefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.sachbuchId,
    () =>
      improveSachbuchKapitelManuscript({
        ...parsed.data,
        extraChangeOrders: [...SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS],
      }),
    "Manuskript-Verbesserung fehlgeschlagen.",
  );
}

/**
 * Improve all chapters with default editorial change-orders plus Buch-Bewertung
 * (when present). Re-runs chapters whose Lektorat is older than the book score.
 */
export async function improveAllSachbuchManuscriptAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }
  return wrap(
    parsed.data.id,
    () =>
      improveAllSachbuchManuscript({
        sachbuchId: parsed.data.id,
        extraChangeOrders: [...SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS],
      }),
    "Manuskript-Gesamtverbesserung fehlgeschlagen.",
  );
}
