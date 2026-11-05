"use server";

/**
 * Admin CRUD for Sachbuch books (phases 1–6).
 */

import { z } from "zod";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import { parseSachbuchHoerbuchState } from "@/lib/sachbuch/hoerbuch";
import { emptySachbuchKapitel } from "@/lib/sachbuch/parse";
import {
  applySachbuchCompactProductSplit,
  createSachbuchCompactEdition,
} from "@/lib/sachbuch/compact";
import { createSachbuchTeaserEdition } from "@/lib/sachbuch/teaser";
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

/** Create a new book: ready idea (paste) or interview on the dashboard. */
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
    const mode = parsed.data.ideaMode;
    const idea = (parsed.data.highConceptIdea ?? "").trim();
    if (mode === "ready" && idea.length < 20) {
      return {
        success: false,
        error:
          "Bitte die Idee etwas ausführlicher beschreiben (mind. 20 Zeichen).",
      };
    }
    const title =
      parsed.data.title?.trim() ||
      idea.split(/[.!?\n]/)[0]?.trim().slice(0, 80) ||
      "Unbenanntes Sachbuch";

    let book = await createSachbuchKontext({
      title,
      buchArt: parsed.data.buchArt,
      bookTypeId: parsed.data.bookTypeId,
      ideaMode: mode,
      highConceptIdea: idea,
    });

    if (mode === "interview") {
      const { startSachbuchIdeeInterview } = await import(
        "@/lib/sachbuch/idee"
      );
      book = await startSachbuchIdeeInterview(book.id);
    }

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

/** Derive a compact edition and open it on Manuskript (prose follows in hops). */
export async function createSachbuchCompactAction(
  input: unknown,
): Promise<ActionResult<{ bookId: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await createSachbuchCompactEdition(parsed.data.id);
    revalidateSachbuchAdmin(book.id);
    revalidateSachbuchAdmin(parsed.data.id);
    return { success: true, data: { bookId: book.id } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kompakt-Ausgabe anlegen fehlgeschlagen.",
    };
  }
}

/**
 * Existing Kompakt: refresh Titelei, strip figures/captions, ensure Hauptband-Verweise.
 */
export async function applySachbuchCompactProductSplitAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await applySachbuchCompactProductSplit(parsed.data.id);
    revalidateSachbuchAdmin(book.id);
    return { success: true, data: { book } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kompakt-Produkttrennung fehlgeschlagen.",
    };
  }
}

/** Derive a teaser from a finished Kompakt edition. */
export async function createSachbuchTeaserAction(
  input: unknown,
): Promise<ActionResult<{ bookId: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await createSachbuchTeaserEdition(parsed.data.id);
    revalidateSachbuchAdmin(book.id);
    revalidateSachbuchAdmin(parsed.data.id);
    return { success: true, data: { bookId: book.id } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Teaser anlegen fehlgeschlagen.",
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
      idee: {
        ...parsed.data.idee,
        hoerbuch: parseSachbuchHoerbuchState(parsed.data.idee.hoerbuch),
      },
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
