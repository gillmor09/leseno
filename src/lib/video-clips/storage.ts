/**
 * Private Supabase Storage for admin Gemini Veo clips (`video-clips` bucket).
 */

import { createServiceClient } from "@/lib/supabase/service";

export const VIDEO_CLIPS_BUCKET = "video-clips";
export const VIDEO_CLIPS_MIME = "video/mp4";

const SIGNED_URL_SECONDS = 60 * 60;

export function videoClipObjectPath(clipId: string): string {
  return `${clipId}.mp4`;
}

/** Upload MP4 bytes for a clip id. */
export async function uploadVideoClipObject(input: {
  clipId: string;
  buffer: Buffer;
}): Promise<{ storagePath: string; byteSize: number }> {
  const storagePath = videoClipObjectPath(input.clipId);
  const storage = createServiceClient(null).storage.from(VIDEO_CLIPS_BUCKET);
  const { error } = await storage.upload(storagePath, input.buffer, {
    contentType: VIDEO_CLIPS_MIME,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`Video-Upload fehlgeschlagen: ${error.message}`);
  }
  return { storagePath, byteSize: input.buffer.byteLength };
}

/** Signed playback/download URL (1 hour). */
export async function createVideoClipSignedUrl(
  storagePath: string,
): Promise<string> {
  const storage = createServiceClient(null).storage.from(VIDEO_CLIPS_BUCKET);
  const { data, error } = await storage.createSignedUrl(
    storagePath,
    SIGNED_URL_SECONDS,
  );
  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Video-Link konnte nicht erzeugt werden.",
    );
  }
  return data.signedUrl;
}

/** Best-effort remove of a Storage object. */
export async function deleteVideoClipObject(
  storagePath: string,
): Promise<void> {
  const path = storagePath.trim();
  if (!path) return;
  const storage = createServiceClient(null).storage.from(VIDEO_CLIPS_BUCKET);
  await storage.remove([path]);
}
