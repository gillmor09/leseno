/**
 * Service-role access for the admin novel pipeline RPCs.
 */

import {
  emptyBuchruecken,
  emptyVorsatz,
  parseBuchrueckenJson,
  parseVorsatzJson,
  type RomanBuchruecken,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import {
  parseCharaktereJson,
  parseSzenenRasterJson,
} from "@/lib/roman/fundament";
import type {
  ClaimedSzene,
  RomanKontext,
  RomanKontextSummary,
  RomanUpsertInput,
  Szene,
  SzeneRoadmapItem,
  SzeneStatus,
} from "@/lib/roman/types";
import { createServiceClient } from "@/lib/supabase/service";

type KontextRow = {
  id: string;
  title: string;
  manuskript_raw: string;
  stilbibel: string;
  aktuelle_zusammenfassung: string;
  genre?: string;
  praemisse?: string;
  perspektive?: string;
  zeitform?: string;
  tonalitaet?: string;
  charaktere?: unknown;
  welt_schauplaetze?: string;
  welt_regeln?: string;
  szenen_raster?: unknown;
  ki_regelwerk?: string;
  fan_persona_name?: string;
  fan_persona_profil?: string;
  cover_image_data_url?: string;
  cover_prompt?: string;
  autor_name?: string;
  buchruecken?: unknown;
  vorsatz?: unknown;
  has_cover?: boolean;
  created_at: string;
  updated_at: string;
  szenen_total?: number;
  szenen_completed?: number;
  szenen_ready?: number;
};

type SzeneRow = {
  id: string;
  roman_id: string;
  kapitel_nr: number;
  szenen_nr: number;
  briefing: string;
  entwurf_raw: string;
  feedback_lektor: string;
  feedback_fan: string;
  entwurf_revidiert: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  stilbibel?: string;
  aktuelle_zusammenfassung?: string;
  genre?: string;
  praemisse?: string;
  perspektive?: string;
  zeitform?: string;
  tonalitaet?: string;
  charaktere?: unknown;
  welt_schauplaetze?: string;
  welt_regeln?: string;
  szenen_raster?: unknown;
  ki_regelwerk?: string;
  fan_persona_name?: string;
  fan_persona_profil?: string;
};

function mapStatus(value: string): SzeneStatus {
  switch (value) {
    case "DRAFTING":
    case "REVIEWING":
    case "REVISING":
    case "COMPLETED":
    case "READY_FOR_WRITING":
      return value;
    default:
      return "READY_FOR_WRITING";
  }
}

function mapKontext(row: KontextRow): RomanKontext {
  return {
    id: row.id,
    title: row.title,
    manuskriptRaw: row.manuskript_raw ?? "",
    stilbibel: row.stilbibel ?? "",
    aktuelleZusammenfassung: row.aktuelle_zusammenfassung ?? "",
    genre: row.genre ?? "",
    praemisse: row.praemisse ?? "",
    perspektive: row.perspektive ?? "",
    zeitform: row.zeitform ?? "",
    tonalitaet: row.tonalitaet ?? "",
    charaktere: parseCharaktereJson(row.charaktere),
    weltSchauplaetze: row.welt_schauplaetze ?? "",
    weltRegeln: row.welt_regeln ?? "",
    szenenRaster: parseSzenenRasterJson(row.szenen_raster),
    kiRegelwerk: row.ki_regelwerk ?? "",
    fanPersonaName: row.fan_persona_name ?? "",
    fanPersonaProfil: row.fan_persona_profil ?? "",
    coverImageDataUrl: row.cover_image_data_url ?? "",
    coverPrompt: row.cover_prompt ?? "",
    autorName: row.autor_name ?? "",
    buchruecken: row.buchruecken
      ? parseBuchrueckenJson(row.buchruecken)
      : emptyBuchruecken(),
    vorsatz: row.vorsatz ? parseVorsatzJson(row.vorsatz) : emptyVorsatz(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: KontextRow): RomanKontextSummary {
  return {
    ...mapKontext(row),
    szenenTotal: row.szenen_total ?? 0,
    szenenCompleted: row.szenen_completed ?? 0,
    szenenReady: row.szenen_ready ?? 0,
    hasCover:
      row.has_cover ??
      Boolean((row.cover_image_data_url ?? "").trim()),
  };
}

function mapSzene(row: SzeneRow): Szene {
  return {
    id: row.id,
    romanId: row.roman_id,
    kapitelNr: row.kapitel_nr,
    szenenNr: row.szenen_nr,
    briefing: row.briefing ?? "",
    entwurfRaw: row.entwurf_raw ?? "",
    feedbackLektor: row.feedback_lektor ?? "",
    feedbackFan: row.feedback_fan ?? "",
    entwurfRevidiert: row.entwurf_revidiert ?? "",
    status: mapStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All romane for admin list. */
export async function listRomanKontexte(): Promise<RomanKontextSummary[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_roman_kontexte");
  if (error) throw new Error(error.message);
  return ((data ?? []) as KontextRow[]).map(mapSummary);
}

/** One roman by id. */
export async function getRomanKontext(id: string): Promise<RomanKontext | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_roman", { p_id: id });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapKontext(row as KontextRow);
}

/** Scenes for a roman, ordered. */
export async function listSzenen(romanId: string): Promise<Szene[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_szenen", {
    p_roman_id: romanId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SzeneRow[]).map(mapSzene);
}

/** Create or update roman context including optional foundation. */
export async function upsertRomanKontext(
  input: RomanUpsertInput,
): Promise<RomanKontext> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_upsert_roman_kontext", {
    p_id: input.id ?? null,
    p_title: input.title,
    p_manuskript_raw: input.manuskriptRaw,
    p_stilbibel: input.stilbibel,
    p_genre: input.genre,
    p_praemisse: input.praemisse,
    p_perspektive: input.perspektive,
    p_zeitform: input.zeitform,
    p_tonalitaet: input.tonalitaet,
    p_charaktere: input.charaktere,
    p_welt_schauplaetze: input.weltSchauplaetze,
    p_welt_regeln: input.weltRegeln,
    p_szenen_raster: input.szenenRaster,
    p_ki_regelwerk: input.kiRegelwerk,
    p_fan_persona_name: input.fanPersonaName,
    p_fan_persona_profil: input.fanPersonaProfil,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Roman konnte nicht gespeichert werden.");
  return mapKontext(row as KontextRow);
}

/** Replace non-completed scenes with a fresh roadmap. */
export async function replaceSzenenRoadmap(
  romanId: string,
  rows: SzeneRoadmapItem[],
): Promise<number> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_replace_szenen_roadmap", {
    p_roman_id: romanId,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Claims the next READY scene (status → DRAFTING) or returns null.
 */
export async function claimNextSzene(
  romanId: string,
): Promise<ClaimedSzene | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_claim_next_szene", {
    p_roman_id: romanId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const mapped = mapSzene(row as SzeneRow);
  const raw = row as SzeneRow;
  return {
    ...mapped,
    stilbibel: raw.stilbibel ?? "",
    aktuelleZusammenfassung: raw.aktuelle_zusammenfassung ?? "",
    genre: raw.genre ?? "",
    praemisse: raw.praemisse ?? "",
    perspektive: raw.perspektive ?? "",
    zeitform: raw.zeitform ?? "",
    tonalitaet: raw.tonalitaet ?? "",
    charaktere: parseCharaktereJson(raw.charaktere),
    weltSchauplaetze: raw.welt_schauplaetze ?? "",
    weltRegeln: raw.welt_regeln ?? "",
    szenenRaster: parseSzenenRasterJson(raw.szenen_raster),
    kiRegelwerk: raw.ki_regelwerk ?? "",
    fanPersonaName: raw.fan_persona_name ?? "",
    fanPersonaProfil: raw.fan_persona_profil ?? "",
  };
}

/** Patch scene text fields / status. */
export async function updateSzene(input: {
  id: string;
  entwurfRaw?: string | null;
  feedbackLektor?: string | null;
  feedbackFan?: string | null;
  entwurfRevidiert?: string | null;
  status?: SzeneStatus | null;
}): Promise<Szene> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_update_szene", {
    p_id: input.id,
    p_entwurf_raw: input.entwurfRaw ?? null,
    p_feedback_lektor: input.feedbackLektor ?? null,
    p_feedback_fan: input.feedbackFan ?? null,
    p_entwurf_revidiert: input.entwurfRevidiert ?? null,
    p_status: input.status ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Szene konnte nicht aktualisiert werden.");
  return mapSzene(row as SzeneRow);
}

/** Append a scene summary to the running manuscript summary. */
export async function appendRomanZusammenfassung(
  romanId: string,
  paragraph: string,
): Promise<string> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_append_roman_zusammenfassung",
    {
      p_roman_id: romanId,
      p_paragraph: paragraph,
    },
  );
  if (error) throw new Error(error.message);
  return String(data ?? "");
}

/** Persist generated cover data URL + prompt debug. */
export async function setRomanCover(input: {
  id: string;
  coverImageDataUrl: string;
  coverPrompt: string;
}): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_set_roman_cover", {
    p_id: input.id,
    p_cover_image_data_url: input.coverImageDataUrl,
    p_cover_prompt: input.coverPrompt,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Clear cover fields. */
export async function clearRomanCover(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_clear_roman_cover", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Persist author + spine + eBook front matter. */
export async function setRomanFrontMatter(input: {
  id: string;
  autorName: string;
  buchruecken: RomanBuchruecken;
  vorsatz: RomanVorsatz;
}): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_set_roman_front_matter", {
    p_id: input.id,
    p_autor_name: input.autorName,
    p_buchruecken: input.buchruecken,
    p_vorsatz: input.vorsatz,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Delete roman and cascading scenes. */
export async function deleteRoman(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_roman", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Reset a stuck non-completed scene to READY_FOR_WRITING. */
export async function resetSzeneToReady(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_reset_szene_to_ready", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
