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
  parseRomanEditorial,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  parseCharaktereJson,
  parseSzenenRasterJson,
} from "@/lib/roman/fundament";
import { parseIdeenChatJson } from "@/lib/roman/idea-finder";
import type {
  RomanIdeaChatMessage,
  RomanKontext,
  RomanKontextSummary,
  RomanUpsertInput,
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
  editorial?: unknown;
  cover_image_data_url?: string;
  cover_prompt?: string;
  autor_name?: string;
  buchruecken?: unknown;
  vorsatz?: unknown;
  ideen_chat?: unknown;
  has_cover?: boolean;
  created_at: string;
  updated_at: string;
  szenen_total?: number;
  szenen_completed?: number;
  szenen_ready?: number;
};

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
    editorial: parseRomanEditorial(row.editorial),
    coverImageDataUrl: row.cover_image_data_url ?? "",
    coverPrompt: row.cover_prompt ?? "",
    autorName: row.autor_name ?? "",
    buchruecken: row.buchruecken
      ? parseBuchrueckenJson(row.buchruecken)
      : emptyBuchruecken(),
    vorsatz: row.vorsatz ? parseVorsatzJson(row.vorsatz) : emptyVorsatz(),
    ideenChat: parseIdeenChatJson(row.ideen_chat),
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


/** Persist publisher editorial jsonb (length, series, checklist). */
export async function setRomanEditorial(
  id: string,
  editorial: RomanEditorial,
): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_set_roman_editorial", {
    p_id: id,
    p_editorial: editorial,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
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
  const mapped = mapKontext(row as KontextRow);
  if (input.editorial) {
    await setRomanEditorial(mapped.id, input.editorial);
    return { ...mapped, editorial: input.editorial };
  }
  return mapped;
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

/** Persist Ideen-Chat transcript. */
export async function setRomanIdeenChat(input: {
  id: string;
  messages: RomanIdeaChatMessage[];
}): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_set_roman_ideen_chat", {
    p_id: input.id,
    p_ideen_chat: input.messages,
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
