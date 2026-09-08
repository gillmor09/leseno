/**
 * Story TTS files in private Supabase Storage bucket `story-tts`.
 * Path: `{userId}/{storyId}.mp3` — signed URLs only (no public bucket).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const STORY_TTS_BUCKET = "story-tts";
export const STORY_TTS_MIME = "audio/mpeg";

/** Signed URL lifetime for playback (1 hour). */
const SIGNED_URL_SECONDS = 60 * 60;

export function storyTtsObjectPath(userId: string, storyId: string): string {
  return `${userId}/${storyId}.mp3`;
}

/**
 * Uploads merged MP3 and writes metadata on `user_stories` (owner RPC).
 */
export async function uploadStoryTtsAudio(input: {
  userId: string;
  storyId: string;
  audio: Buffer;
  modelSlug: string;
  /** SHA-256 of plain story text used for this audio. */
  sourceHash: string;
  /** Optional Whisper-aligned timings (JSON array); null clears. */
  wordTimingsJson: unknown | null;
}): Promise<{ storagePath: string; byteSize: number }> {
  const storagePath = storyTtsObjectPath(input.userId, input.storyId);
  const storage = createServiceClient(null).storage.from(STORY_TTS_BUCKET);

  const { error: uploadError } = await storage.upload(
    storagePath,
    input.audio,
    {
      contentType: STORY_TTS_MIME,
      upsert: true,
      cacheControl: "3600",
    },
  );
  if (uploadError) {
    throw new Error(`TTS-Upload fehlgeschlagen: ${uploadError.message}`);
  }

  const supabase = await createClient(null);
  const { error: metaError } = await supabase.rpc("set_my_story_tts", {
    p_id: input.storyId,
    p_storage_path: storagePath,
    p_mime_type: STORY_TTS_MIME,
    p_byte_size: input.audio.byteLength,
    p_model_slug: input.modelSlug,
    p_source_hash: input.sourceHash,
    p_word_timings: input.wordTimingsJson,
  });
  if (metaError) {
    throw new Error(`TTS-Metadaten speichern fehlgeschlagen: ${metaError.message}`);
  }

  return { storagePath, byteSize: input.audio.byteLength };
}

/** Creates a time-limited signed URL for an owned story TTS object. */
export async function createStoryTtsSignedUrl(
  storagePath: string,
): Promise<string> {
  const storage = createServiceClient(null).storage.from(STORY_TTS_BUCKET);
  const { data, error } = await storage.createSignedUrl(
    storagePath,
    SIGNED_URL_SECONDS,
  );
  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "TTS-Wiedergabe-Link konnte nicht erzeugt werden.",
    );
  }
  return data.signedUrl;
}

/** Loads TTS storage path for the current user's story, if present. */
export async function getMyStoryTtsMeta(storyId: string): Promise<{
  storagePath: string;
  mimeType: string;
  byteSize: number | null;
  modelSlug: string | null;
  sourceHash: string | null;
  wordTimings: unknown | null;
} | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_story_tts", {
    p_id: storyId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const path =
    typeof (row as { storage_path?: string }).storage_path === "string"
      ? (row as { storage_path: string }).storage_path.trim()
      : "";
  if (!path) return null;
  return {
    storagePath: path,
    mimeType:
      typeof (row as { mime_type?: string }).mime_type === "string"
        ? (row as { mime_type: string }).mime_type
        : STORY_TTS_MIME,
    byteSize:
      typeof (row as { byte_size?: number }).byte_size === "number"
        ? (row as { byte_size: number }).byte_size
        : null,
    modelSlug:
      typeof (row as { model_slug?: string }).model_slug === "string"
        ? (row as { model_slug: string }).model_slug
        : null,
    sourceHash:
      typeof (row as { source_hash?: string }).source_hash === "string"
        ? (row as { source_hash: string }).source_hash
        : null,
    wordTimings:
      (row as { word_timings?: unknown }).word_timings !== undefined
        ? (row as { word_timings: unknown }).word_timings
        : null,
  };
}

/** Best-effort delete of TTS object when a story is removed. */
export async function deleteStoryTtsObject(
  userId: string,
  storyId: string,
): Promise<void> {
  const storage = createServiceClient(null).storage.from(STORY_TTS_BUCKET);
  await storage.remove([storyTtsObjectPath(userId, storyId)]);
}
