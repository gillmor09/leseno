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
  firstSachbuchZodMessage,
  sachbuchAbschnittReplySchema,
  sachbuchGenerateSchema,
  sachbuchIdeeTurnSchema,
  sachbuchIdSchema,
  sachbuchKapitelRefSchema,
} from "@/lib/validations/sachbuch";

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
