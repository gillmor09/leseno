/**
 * Service-role RPCs for admin video clip metadata (`leseno.video_clips`).
 */

import {
  createVideoClipSignedUrl,
  deleteVideoClipObject,
  uploadVideoClipObject,
  VIDEO_CLIPS_MIME,
} from "@/lib/video-clips/storage";
import { createServiceClient } from "@/lib/supabase/service";

export type VideoClipRow = {
  id: string;
  title: string;
  prompt: string;
  modelSlug: string;
  durationSeconds: number;
  aspectRatio: string;
  storagePath: string;
  mimeType: string;
  byteSize: number | null;
  sourceKind: "image" | "video";
  sourceFileName: string;
  /** Gemini download URI from generation (optional metadata). */
  veoFileUri: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type VideoClipListItem = VideoClipRow & {
  /** Time-limited signed URL for playback/download. */
  signedUrl: string | null;
};

type DbRow = {
  id: string;
  title: string;
  prompt: string;
  model_slug: string;
  duration_seconds: number;
  aspect_ratio: string;
  storage_path: string;
  mime_type: string;
  byte_size: number | null;
  source_kind: string;
  source_file_name: string;
  veo_file_uri?: string | null;
  created_by: string | null;
  created_at: string;
};

function mapRow(row: DbRow): VideoClipRow {
  return {
    id: row.id,
    title: row.title ?? "",
    prompt: row.prompt ?? "",
    modelSlug: row.model_slug ?? "",
    durationSeconds: row.duration_seconds ?? 8,
    aspectRatio: row.aspect_ratio ?? "16:9",
    storagePath: row.storage_path,
    mimeType: row.mime_type ?? VIDEO_CLIPS_MIME,
    byteSize: row.byte_size,
    sourceKind: row.source_kind === "video" ? "video" : "image",
    sourceFileName: row.source_file_name ?? "",
    veoFileUri: row.veo_file_uri?.trim() || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** List clips newest first (without signed URLs). */
export async function listVideoClips(): Promise<VideoClipRow[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_video_clips");
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map(mapRow);
}

/** List clips with signed URLs for the admin UI. */
export async function listVideoClipsWithUrls(): Promise<VideoClipListItem[]> {
  const rows = await listVideoClips();
  return Promise.all(
    rows.map(async (row) => {
      try {
        const signedUrl = await createVideoClipSignedUrl(row.storagePath);
        return { ...row, signedUrl };
      } catch {
        return { ...row, signedUrl: null };
      }
    }),
  );
}

/** Persist generated MP4 to Storage + metadata row. */
export async function saveGeneratedVideoClip(input: {
  clipId: string;
  buffer: Buffer;
  title: string;
  prompt: string;
  modelSlug: string;
  durationSeconds: number;
  aspectRatio: string;
  sourceKind: "image" | "video";
  sourceFileName: string;
  veoFileUri: string | null;
  createdBy: string | null;
}): Promise<VideoClipRow> {
  const { storagePath, byteSize } = await uploadVideoClipObject({
    clipId: input.clipId,
    buffer: input.buffer,
  });

  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_insert_video_clip", {
    p_id: input.clipId,
    p_title: input.title,
    p_prompt: input.prompt,
    p_model_slug: input.modelSlug,
    p_duration_seconds: input.durationSeconds,
    p_aspect_ratio: input.aspectRatio,
    p_storage_path: storagePath,
    p_mime_type: VIDEO_CLIPS_MIME,
    p_byte_size: byteSize,
    p_source_kind: input.sourceKind,
    p_source_file_name: input.sourceFileName,
    p_veo_file_uri: input.veoFileUri,
    p_created_by: input.createdBy,
  });

  if (error) {
    await deleteVideoClipObject(storagePath).catch(() => undefined);
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    await deleteVideoClipObject(storagePath).catch(() => undefined);
    throw new Error("Video-Clip konnte nicht gespeichert werden.");
  }
  return mapRow(row as DbRow);
}

/** Delete metadata + Storage object. */
export async function deleteVideoClip(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_video_clip", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !(row as { deleted?: boolean }).deleted) return false;
  const path = String((row as { storage_path?: string }).storage_path ?? "");
  if (path) {
    await deleteVideoClipObject(path).catch(() => undefined);
  }
  return true;
}
