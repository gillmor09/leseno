/**
 * Social Media global settings + Instagram posts via service-role RPCs.
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  emptyGlobalSettings,
  isSocialChannel,
  type SocialChannel,
  type SocialGlobalSettings,
  type SocialPost,
} from "@/lib/social/types";

type GlobalRow = {
  storyline: string;
  role: string;
  format: string;
  action: string;
  image_prompt: string;
  updated_at: string | null;
};

type PostRow = {
  id: string;
  year_month: string;
  post_date: string;
  channel: string;
  caption: string;
  image_data_url: string | null;
  last_image_prompt: string | null;
  published: boolean | null;
  angle_id: string | null;
  updated_at: string;
};

type AngleUsageRow = {
  angle_id: string;
  use_count: number | string;
};

function mapGlobal(row: GlobalRow): SocialGlobalSettings {
  return {
    storyline: row.storyline ?? "",
    role: row.role ?? "",
    format: row.format ?? "",
    action: row.action ?? "",
    imagePrompt: row.image_prompt ?? "",
    updatedAt: row.updated_at,
  };
}

function mapPost(row: PostRow): SocialPost {
  const channel = isSocialChannel(row.channel) ? row.channel : "instagram";
  const postDate =
    typeof row.post_date === "string"
      ? row.post_date.slice(0, 10)
      : String(row.post_date).slice(0, 10);
  return {
    id: row.id,
    yearMonth: row.year_month,
    postDate,
    channel,
    caption: row.caption ?? "",
    imageDataUrl: row.image_data_url,
    lastImagePrompt: row.last_image_prompt,
    published: Boolean(row.published),
    angleId: row.angle_id?.trim() || null,
    updatedAt: row.updated_at,
  };
}

export async function getSocialGlobalSettings(): Promise<SocialGlobalSettings> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_get_social_global_settings",
  );
  if (error) throw new Error(error.message);
  const row = (data as GlobalRow[] | null)?.[0];
  return row ? mapGlobal(row) : emptyGlobalSettings();
}

export async function upsertSocialGlobalSettings(
  settings: SocialGlobalSettings,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_social_global_settings", {
    p_storyline: settings.storyline,
    p_role: settings.role,
    p_format: settings.format,
    p_action: settings.action,
    p_image_prompt: settings.imagePrompt,
  });
  if (error) throw new Error(error.message);
}

export async function ensureSocialMonth(yearMonth: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_ensure_social_month", {
    p_year_month: yearMonth,
  });
  if (error) throw new Error(error.message);
}

export async function listSocialPosts(
  yearMonth: string,
): Promise<SocialPost[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_social_posts", {
    p_year_month: yearMonth,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PostRow[])
    .map(mapPost)
    .filter((post) => post.channel === "instagram");
}

/** All Instagram posts (newest dates first) for the sequential workspace. */
export async function listAllSocialPosts(): Promise<SocialPost[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_all_social_posts");
  if (error) throw new Error(error.message);
  return ((data ?? []) as PostRow[])
    .map(mapPost)
    .filter((post) => post.channel === "instagram");
}

/** How often each Winkel id appears across all posts. */
export async function getSocialAngleUsage(): Promise<Record<string, number>> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_social_angle_usage");
  if (error) throw new Error(error.message);
  const usage: Record<string, number> = {};
  for (const row of (data ?? []) as AngleUsageRow[]) {
    const id = row.angle_id?.trim();
    if (!id) continue;
    usage[id] = Number(row.use_count) || 0;
  }
  return usage;
}

export async function upsertSocialPost(input: {
  yearMonth: string;
  postDate: string;
  channel?: SocialChannel;
  caption?: string | null;
  imageDataUrl?: string | null;
  lastImagePrompt?: string | null;
  clearImage?: boolean;
  published?: boolean | null;
  angleId: string;
}): Promise<SocialPost> {
  const supabase = createServiceClient(null);
  await ensureSocialMonth(input.yearMonth);
  const { data, error } = await supabase.rpc("admin_upsert_social_post", {
    p_year_month: input.yearMonth,
    p_post_date: input.postDate,
    p_channel: input.channel ?? "instagram",
    p_caption: input.caption ?? null,
    p_image_data_url: input.imageDataUrl ?? null,
    p_last_image_prompt: input.lastImagePrompt ?? null,
    p_clear_image: Boolean(input.clearImage),
    p_published:
      typeof input.published === "boolean" ? input.published : null,
    p_angle_id: input.angleId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Post konnte nicht gespeichert werden.");
  return mapPost(row as PostRow);
}
