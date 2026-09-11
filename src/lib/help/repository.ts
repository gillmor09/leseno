/**
 * Loads/saves help texts via service-role RPCs (`leseno.help_texts`).
 * Missing DB rows fall back to built-in defaults from `defaults.ts`.
 */

import {
  getHelpPage,
  getHelpSlot,
  isHelpPageId,
  type HelpPageId,
} from "@/lib/help/catalog";
import { getHelpDefault } from "@/lib/help/defaults";
import { sanitizeHelpHtml } from "@/lib/help/sanitize-help-html";
import type { HelpText, HelpTextMap } from "@/lib/help/types";
import { createServiceClient } from "@/lib/supabase/service";

type Row = {
  page_id: string;
  slot_id: string;
  title: string;
  html_body: string;
  updated_at: string | null;
};

function mapRow(row: Row): HelpText | null {
  if (!isHelpPageId(row.page_id)) return null;
  return {
    pageId: row.page_id,
    slotId: row.slot_id,
    title: row.title,
    htmlBody: row.html_body ?? "",
    updatedAt: row.updated_at,
  };
}

/** Built-in defaults only (no DB) — used when RPCs are unavailable. */
export function listHelpTextsFromDefaultsOnly(
  pageId: HelpPageId,
): HelpTextMap {
  const map: HelpTextMap = {};
  for (const slot of getHelpPage(pageId).slots) {
    const fallback = getHelpDefault(pageId, slot.id);
    if (!fallback) continue;
    const html = sanitizeHelpHtml(fallback.htmlBody);
    if (!html.trim()) continue;
    map[slot.id] = {
      title: fallback.title,
      htmlBody: html,
    };
  }
  return map;
}

/**
 * All help rows for admin (may include empty bodies).
 */
export async function listAllHelpTexts(): Promise<HelpText[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_help_texts");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[])
    .map(mapRow)
    .filter((row): row is HelpText => row !== null);
}

/**
 * Help map for one member page: DB overrides defaults; empty DB body hides the slot.
 */
export async function listHelpTextsForPage(
  pageId: HelpPageId,
): Promise<HelpTextMap> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("list_help_texts_for_page", {
    p_page_id: pageId,
  });
  if (error) throw new Error(error.message);

  const bySlot = new Map<string, HelpText>();
  for (const row of (data ?? []) as Row[]) {
    const mapped = mapRow(row);
    if (mapped) bySlot.set(mapped.slotId, mapped);
  }

  const map: HelpTextMap = {};
  for (const slot of getHelpPage(pageId).slots) {
    const stored = bySlot.get(slot.id);
    if (stored) {
      const html = sanitizeHelpHtml(stored.htmlBody);
      if (!html.trim()) continue;
      map[slot.id] = {
        title:
          stored.title.trim() ||
          getHelpSlot(pageId, slot.id)?.defaultTitle ||
          "Hilfe",
        htmlBody: html,
      };
      continue;
    }

    const fallback = getHelpDefault(pageId, slot.id);
    if (!fallback) continue;
    const html = sanitizeHelpHtml(fallback.htmlBody);
    if (!html.trim()) continue;
    map[slot.id] = {
      title: fallback.title,
      htmlBody: html,
    };
  }
  return map;
}

/**
 * Creates or updates one help slot.
 */
export async function upsertHelpText(input: {
  pageId: HelpPageId;
  slotId: string;
  title: string;
  htmlBody: string;
}): Promise<HelpText> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_upsert_help_text", {
    p_page_id: input.pageId,
    p_slot_id: input.slotId,
    p_title: input.title,
    p_html_body: input.htmlBody,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const mapped = row ? mapRow(row as Row) : null;
  if (!mapped) throw new Error("Hilfetext konnte nicht gespeichert werden.");
  return mapped;
}
