/**
 * Service-role access for Sachbuch admin RPCs (`leseno.sachbuch_kontext`).
 */

import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import { getSachbuchBookType } from "@/lib/sachbuch/book-types";
import {
  emptySachbuchEvidenz,
  emptySachbuchIdee,
  emptySachbuchMakro,
  mapSachbuchRow,
} from "@/lib/sachbuch/parse";
import type {
  SachbuchExport,
  SachbuchKontext,
  SachbuchKontextSummary,
  SachbuchMakroTyp,
  SachbuchUpsertInput,
} from "@/lib/sachbuch/types";
import { createServiceClient } from "@/lib/supabase/service";

type Row = {
  id: string;
  title: string;
  stilbibel: string;
  zielgruppe?: string;
  agents: unknown;
  kapitel: unknown;
  idee?: unknown;
  evidenz?: unknown;
  makro?: unknown;
  suggested_title?: unknown;
  subtitle?: unknown;
  summary?: unknown;
  keywords?: unknown;
  autor_name?: unknown;
  vorsatz?: unknown;
  cover_image_data_url?: unknown;
  cover_prompt?: unknown;
  kapitel_count?: number;
  created_at: string;
  updated_at: string;
};

/** All books for the admin list. */
export async function listSachbuchKontexte(): Promise<SachbuchKontextSummary[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_sachbuch_kontexte");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({
    ...mapSachbuchRow(row),
    kapitelCount:
      row.kapitel_count ??
      (Array.isArray(row.kapitel) ? row.kapitel.length : 0),
  }));
}

/** One book by id. */
export async function getSachbuchKontext(
  id: string,
): Promise<SachbuchKontext | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_sachbuch_kontext", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapSachbuchRow(row as Row);
}

/** Create or update a Sachbuch document. */
export async function upsertSachbuchKontext(
  input: SachbuchUpsertInput,
): Promise<SachbuchKontext> {
  const supabase = createServiceClient(null);
  const { data: id, error } = await supabase.rpc(
    "admin_upsert_sachbuch_kontext",
    {
      p_id: input.id ?? null,
      p_title: input.title.trim(),
      p_stilbibel: input.stilbibel,
      p_zielgruppe: input.zielgruppe,
      p_agents: input.agents,
      p_kapitel: input.kapitel,
      p_idee: input.idee,
      p_evidenz: input.evidenz,
      p_makro: input.makro,
    },
  );
  if (error) throw new Error(error.message);
  const saved = await getSachbuchKontext(String(id));
  if (!saved) {
    throw new Error("Sachbuch nach dem Speichern nicht gefunden.");
  }
  return saved;
}

/**
 * Create a shell book: Idee first. Sachbuchtyp stays empty until suggested/confirmed.
 * Optional `bookTypeId` only for legacy/admin overrides.
 */
export async function createSachbuchKontext(input: {
  title: string;
  buchArt?: SachbuchMakroTyp;
  bookTypeId?: string;
  /** ready = paste idea into briefing; interview = empty Idee for Q&A. */
  ideaMode?: "ready" | "interview";
  highConceptIdea?: string;
}): Promise<SachbuchKontext> {
  const confirmed = getSachbuchBookType(input.bookTypeId);
  const buchArt = input.buchArt ?? confirmed?.makroTyp ?? "journey";
  const idea = (input.highConceptIdea ?? "").trim();
  const mode = input.ideaMode ?? "ready";
  const idee =
    mode === "ready" && idea.length >= 20
      ? {
          ...emptySachbuchIdee(),
          briefing: idea,
          unpopularOpinion: idea.split(/[.!?\n]/)[0]?.trim().slice(0, 280) ?? "",
          status: "ready" as const,
          guide: {
            currentStep: "refine" as const,
            ideaApprovedAt: null,
          },
        }
      : {
          ...emptySachbuchIdee(),
          status: "in_progress" as const,
          guide: {
            currentStep: "concept" as const,
            ideaApprovedAt: null,
          },
        };

  return upsertSachbuchKontext({
    id: null,
    title: input.title.trim() || "Unbenanntes Sachbuch",
    stilbibel: "",
    zielgruppe: "",
    agents: defaultSachbuchAgents(),
    idee,
    evidenz: emptySachbuchEvidenz(),
    makro: emptySachbuchMakro(buchArt, confirmed?.id ?? ""),
    kapitel: [],
  });
}

/** Delete a book. */
export async function deleteSachbuchKontext(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_sachbuch_kontext", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Patch book-level fields and persist. */
export async function patchSachbuchBook(
  sachbuchId: string,
  patch: Partial<
    Pick<
      SachbuchKontext,
      | "title"
      | "stilbibel"
      | "zielgruppe"
      | "agents"
      | "idee"
      | "evidenz"
      | "makro"
      | "kapitel"
    >
  >,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  return upsertSachbuchKontext({
    id: book.id,
    title: patch.title ?? book.title,
    stilbibel: patch.stilbibel ?? book.stilbibel,
    zielgruppe: patch.zielgruppe ?? book.zielgruppe,
    agents: patch.agents ?? book.agents,
    idee: patch.idee ?? book.idee,
    evidenz: patch.evidenz ?? book.evidenz,
    makro: patch.makro ?? book.makro,
    kapitel: patch.kapitel ?? book.kapitel,
  });
}

/**
 * Patch marketing / cover / optional title without rewriting kapitel JSON.
 * Nullish fields are left unchanged in the DB (RPC coalesce).
 */
export async function upsertSachbuchExport(input: {
  id: string;
  suggestedTitle?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  autorName?: string | null;
  vorsatz?: SachbuchExport["vorsatz"] | null;
  coverImageDataUrl?: string | null;
  coverPrompt?: string | null;
  /** When set, updates the book title (e.g. apply suggested title). */
  title?: string | null;
}): Promise<SachbuchKontext> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_sachbuch_export", {
    p_id: input.id,
    p_suggested_title: input.suggestedTitle ?? null,
    p_subtitle: input.subtitle ?? null,
    p_summary: input.summary ?? null,
    p_keywords: input.keywords ?? null,
    p_autor_name: input.autorName ?? null,
    p_vorsatz: input.vorsatz ?? null,
    p_cover_image_data_url: input.coverImageDataUrl ?? null,
    p_cover_prompt: input.coverPrompt ?? null,
    p_title: input.title ?? null,
  });
  if (error) throw new Error(error.message);
  const saved = await getSachbuchKontext(input.id);
  if (!saved) {
    throw new Error("Sachbuch nach Export-Update nicht gefunden.");
  }
  return saved;
}

/** Replace one kapitel inside a book and persist. */
export async function patchSachbuchKapitel(
  sachbuchId: string,
  kapitelId: string,
  patch: Partial<import("@/lib/sachbuch/types").SachbuchKapitel>,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const idx = book.kapitel.findIndex((k) => k.id === kapitelId);
  if (idx < 0) throw new Error("Kapitel nicht gefunden.");
  const next = [...book.kapitel];
  next[idx] = {
    ...next[idx]!,
    ...patch,
    id: kapitelId,
    updatedAt: new Date().toISOString(),
  };
  return upsertSachbuchKontext({
    id: book.id,
    title: book.title,
    stilbibel: book.stilbibel,
    zielgruppe: book.zielgruppe,
    agents: book.agents,
    idee: book.idee,
    evidenz: book.evidenz,
    makro: book.makro,
    kapitel: next,
  });
}
