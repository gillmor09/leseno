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
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  approveSachbuchIdeeRefine,
  rejectSachbuchIdeeRefine,
  runSachbuchIdeeRefine,
  setSachbuchGuideStep,
} from "@/lib/sachbuch/idee-refine";
import {
  applySachbuchBookType,
  suggestSachbuchBookType,
  type SachbuchBookTypeSuggestResult,
} from "@/lib/sachbuch/suggest-book-type";
import type { SachbuchGuideStep } from "@/lib/sachbuch/types";
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

const guideStepActionSchema = z.object({
  sachbuchId: z.string().uuid(),
  step: z.enum([
    "concept",
    "refine",
    "book_type",
    "evidenz",
    "makro",
    "write",
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
  return wrap(
    parsed.data.sachbuchId,
    () =>
      setSachbuchGuideStep(
        parsed.data.sachbuchId,
        parsed.data.step as SachbuchGuideStep,
      ),
    "Schritt wechseln fehlgeschlagen.",
  );
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
  return wrap(
    parsed.data.sachbuchId,
    () => generateNextAbschnitt(parsed.data),
    "Abschnitt erzeugen fehlgeschlagen.",
  );
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
