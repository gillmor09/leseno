/**
 * Roman Hörbuch MP3s in private Supabase Storage bucket `roman-hoerbuch`.
 * Path: `{romanId}/kapitel-{nn}.mp3` — metadata on `editorial.hoerbuchAudio`.
 */

import { createServiceClient } from "@/lib/supabase/service";

export const ROMAN_HOERBUCH_BUCKET = "roman-hoerbuch";
export const ROMAN_HOERBUCH_MIME = "audio/mpeg";

/** Signed URL lifetime for admin playback / ZIP fetch (2 hours). */
const SIGNED_URL_SECONDS = 2 * 60 * 60;

export function romanHoerbuchObjectPath(
  romanId: string,
  chapterNumber: number,
): string {
  const n = String(Math.floor(chapterNumber)).padStart(2, "0");
  return `${romanId}/kapitel-${n}.mp3`;
}

/**
 * Uploads (upsert) a chapter MP3. Service role bypasses Storage RLS.
 */
export async function uploadRomanHoerbuchAudio(input: {
  romanId: string;
  chapterNumber: number;
  audio: Buffer;
}): Promise<{ storagePath: string; byteSize: number }> {
  const storagePath = romanHoerbuchObjectPath(
    input.romanId,
    input.chapterNumber,
  );
  const storage = createServiceClient(null).storage.from(ROMAN_HOERBUCH_BUCKET);
  const { error } = await storage.upload(storagePath, input.audio, {
    contentType: ROMAN_HOERBUCH_MIME,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`Hörbuch-Upload fehlgeschlagen: ${error.message}`);
  }
  return { storagePath, byteSize: input.audio.byteLength };
}

/** Time-limited signed URL for playback or ZIP download. */
export async function createRomanHoerbuchSignedUrl(
  storagePath: string,
): Promise<string> {
  const storage = createServiceClient(null).storage.from(ROMAN_HOERBUCH_BUCKET);
  const { data, error } = await storage.createSignedUrl(
    storagePath,
    SIGNED_URL_SECONDS,
  );
  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Hörbuch-Wiedergabe-Link konnte nicht erzeugt werden.",
    );
  }
  return data.signedUrl;
}

/** Best-effort delete when regenerating is not needed (upsert overwrites). */
export async function deleteRomanHoerbuchObject(
  storagePath: string,
): Promise<void> {
  const storage = createServiceClient(null).storage.from(ROMAN_HOERBUCH_BUCKET);
  await storage.remove([storagePath]);
}
