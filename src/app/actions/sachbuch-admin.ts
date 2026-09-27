"use server";

/**
 * Admin CRUD for Sachbuch books (phases 1–6).
 */

import { z } from "zod";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import { emptySachbuchKapitel } from "@/lib/sachbuch/parse";
import {
  createSachbuchKontext,
  deleteSachbuchKontext,
  getSachbuchKontext,
  upsertSachbuchKontext,
} from "@/lib/sachbuch/repository";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  firstSachbuchZodMessage,
  sachbuchCreateSchema,
  sachbuchIdSchema,
  sachbuchUpsertSchema,
} from "@/lib/validations/sachbuch";

function bookPayload(book: SachbuchKontext, overrides?: Partial<SachbuchKontext>) {
  return {
    id: book.id,
    title: overrides?.title ?? book.title,
    stilbibel: overrides?.stilbibel ?? book.stilbibel,
    zielgruppe: overrides?.zielgruppe ?? book.zielgruppe,
    agents: overrides?.agents ?? book.agents,
    idee: overrides?.idee ?? book.idee,
    evidenz: overrides?.evidenz ?? book.evidenz,
    makro: overrides?.makro ?? book.makro,
    kapitel: overrides?.kapitel ?? book.kapitel,
  };
}

/** Load one book (e.g. after generation poll completes). */
export async function loadSachbuchAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await getSachbuchKontext(parsed.data.id);
    if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
    return { success: true, data: { book } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Laden fehlgeschlagen.",
    };
  }
}

/** Create a new book shell (title + default agents). */
export async function createSachbuchAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await createSachbuchKontext(
      parsed.data.title,
      parsed.data.buchArt,
    );
    revalidateSachbuchAdmin(book.id);
    return { success: true, data: { book } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Anlegen fehlgeschlagen.",
    };
  }
}

/** Save full book document. */
export async function saveSachbuchAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await upsertSachbuchKontext({
      id: parsed.data.id ?? null,
      title: parsed.data.title,
      stilbibel: parsed.data.stilbibel,
      zielgruppe: parsed.data.zielgruppe,
      agents: parsed.data.agents,
      idee: parsed.data.idee,
      evidenz: parsed.data.evidenz,
      makro: parsed.data.makro,
      kapitel: parsed.data.kapitel,
    });
    revalidateSachbuchAdmin(book.id);
    return { success: true, data: { book } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
    };
  }
}

/** Delete a book. */
export async function deleteSachbuchAction(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const ok = await deleteSachbuchKontext(parsed.data.id);
    if (!ok) return { success: false, error: "Sachbuch nicht gefunden." };
    revalidateSachbuchAdmin();
    return { success: true, data: { ok: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
    };
  }
}

/** Append an empty kapitel (manual; prefer Makro → Kapitel). */
export async function addSachbuchKapitelAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await getSachbuchKontext(parsed.data.id);
    if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
    const agents = book.agents.interviewer.modelSlug.trim()
      ? book.agents
      : defaultSachbuchAgents();
    const saved = await upsertSachbuchKontext(
      bookPayload(book, {
        agents,
        kapitel: [
          ...book.kapitel,
          emptySachbuchKapitel({ title: `Kapitel ${book.kapitel.length + 1}` }),
        ],
      }),
    );
    revalidateSachbuchAdmin(saved.id);
    return { success: true, data: { book: saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel anlegen fehlgeschlagen.",
    };
  }
}

const deleteKapitelSchema = z.object({
  id: z.string().uuid(),
  kapitelId: z.string().uuid(),
});

/** Remove one kapitel by id. */
export async function deleteSachbuchKapitelAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = deleteKapitelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await getSachbuchKontext(parsed.data.id);
    if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
    const saved = await upsertSachbuchKontext(
      bookPayload(book, {
        kapitel: book.kapitel.filter((k) => k.id !== parsed.data.kapitelId),
      }),
    );
    revalidateSachbuchAdmin(saved.id);
    return { success: true, data: { book: saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel löschen fehlgeschlagen.",
    };
  }
}
