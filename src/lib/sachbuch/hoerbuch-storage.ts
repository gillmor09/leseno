/**
 * Sachbuch Hörbuch MP3s in private Supabase Storage bucket `sachbuch-hoerbuch`.
 * Path: `{sachbuchId}/{fileName}` — metadata on `idee.hoerbuch`.
 */

import { createServiceClient } from "@/lib/supabase/service";

export const SACHBUCH_HOERBUCH_BUCKET = "sachbuch-hoerbuch";
export const SACHBUCH_HOERBUCH_MIME = "audio/mpeg";

const SIGNED_URL_SECONDS = 2 * 60 * 60;

export function sachbuchHoerbuchObjectPath(
  sachbuchId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${sachbuchId}/${safe || "track.mp3"}`;
}

export async function uploadSachbuchHoerbuchAudio(input: {
  sachbuchId: string;
  fileName: string;
  audio: Buffer;
}): Promise<{ storagePath: string; byteSize: number }> {
  const storagePath = sachbuchHoerbuchObjectPath(
    input.sachbuchId,
    input.fileName,
  );
  const storage = createServiceClient(null).storage.from(
    SACHBUCH_HOERBUCH_BUCKET,
  );
  const { error } = await storage.upload(storagePath, input.audio, {
    contentType: SACHBUCH_HOERBUCH_MIME,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`Hörbuch-Upload fehlgeschlagen: ${error.message}`);
  }
  return { storagePath, byteSize: input.audio.byteLength };
}

export async function createSachbuchHoerbuchSignedUrl(
  storagePath: string,
): Promise<string> {
  const storage = createServiceClient(null).storage.from(
    SACHBUCH_HOERBUCH_BUCKET,
  );
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

export async function downloadSachbuchHoerbuchAudio(
  storagePath: string,
): Promise<Buffer> {
  const storage = createServiceClient(null).storage.from(
    SACHBUCH_HOERBUCH_BUCKET,
  );
  const { data, error } = await storage.download(storagePath);
  if (error || !data) {
    throw new Error(
      error?.message ?? "Hörbuch-Datei konnte nicht geladen werden.",
    );
  }
  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.byteLength < 100) {
    throw new Error("Hörbuch-Datei ist leer oder beschädigt.");
  }
  return buf;
}

export async function deleteSachbuchHoerbuchObject(
  storagePath: string,
): Promise<void> {
  const path = storagePath.trim();
  if (!path) return;
  const storage = createServiceClient(null).storage.from(
    SACHBUCH_HOERBUCH_BUCKET,
  );
  const { error } = await storage.remove([path]);
  if (error) {
    throw new Error(`Hörbuch-Löschen fehlgeschlagen: ${error.message}`);
  }
}
