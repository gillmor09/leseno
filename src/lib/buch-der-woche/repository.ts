/**
 * Service-role access for Buch-der-Woche settings + whitelist entries.
 */

import type {
  BuchDerWocheEntry,
  BuchDerWocheSettings,
  BuchDerWocheUpsertInput,
} from "@/lib/buch-der-woche/types";
import { createServiceClient } from "@/lib/supabase/service";

type EntryRow = {
  slug: string;
  roman_id: string;
  teaser_headline: string;
  teaser_lead: string;
  ig_image_data_url: string;
  ig_caption: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type SettingsRow = {
  current_slug: string | null;
  updated_at: string;
};

function mapEntry(row: EntryRow): BuchDerWocheEntry {
  return {
    slug: row.slug,
    romanId: row.roman_id,
    teaserHeadline: row.teaser_headline ?? "",
    teaserLead: row.teaser_lead ?? "",
    igImageDataUrl: row.ig_image_data_url ?? "",
    igCaption: row.ig_caption ?? "",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All curated weeks (newest published first). */
export async function listBuchDerWocheEntries(): Promise<BuchDerWocheEntry[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_list_buch_der_woche_entries",
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as EntryRow[]).map(mapEntry);
}

/** One entry by slug, or null. */
export async function getBuchDerWocheEntry(
  slug: string,
): Promise<BuchDerWocheEntry | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_buch_der_woche_entry", {
    p_slug: slug,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapEntry(row as EntryRow);
}

/** Singleton current slug. */
export async function getBuchDerWocheSettings(): Promise<BuchDerWocheSettings> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_get_buch_der_woche_settings",
  );
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as SettingsRow | undefined;
  return {
    currentSlug: row?.current_slug?.trim() || null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Create/update a week entry (IG fields optional — null keeps previous). */
export async function upsertBuchDerWocheEntry(
  input: BuchDerWocheUpsertInput,
): Promise<BuchDerWocheEntry> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_upsert_buch_der_woche_entry",
    {
      p_slug: input.slug,
      p_roman_id: input.romanId,
      p_teaser_headline: input.teaserHeadline,
      p_teaser_lead: input.teaserLead,
      p_ig_image_data_url: input.igImageDataUrl ?? null,
      p_ig_caption: input.igCaption ?? null,
      p_set_published: Boolean(input.setPublished),
    },
  );
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Eintrag konnte nicht gespeichert werden.");
  return mapEntry(row as EntryRow);
}

/** Point /buch-der-woche at this slug (must already exist). */
export async function setBuchDerWocheCurrent(
  slug: string,
): Promise<BuchDerWocheSettings> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_set_buch_der_woche_current",
    { p_slug: slug },
  );
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as SettingsRow | undefined;
  return {
    currentSlug: row?.current_slug?.trim() || null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Current live entry, or null if unset. */
export async function getCurrentBuchDerWocheEntry(): Promise<BuchDerWocheEntry | null> {
  const settings = await getBuchDerWocheSettings();
  if (!settings.currentSlug) return null;
  return getBuchDerWocheEntry(settings.currentSlug);
}
