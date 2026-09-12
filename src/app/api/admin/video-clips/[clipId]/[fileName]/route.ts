/**
 * Streams a saved admin video clip as an MP4 download (attachment).
 * Requires admin session; path ends with titled `.mp4` for the browser filename.
 */

import { NextResponse } from "next/server";

import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  attachmentMp4ContentDisposition,
  sanitizeMp4Basename,
} from "@/lib/video-clips/download-name";
import { listVideoClips } from "@/lib/video-clips/repository";
import {
  VIDEO_CLIPS_BUCKET,
  VIDEO_CLIPS_MIME,
} from "@/lib/video-clips/storage";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clipId: string; fileName: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isCurrentUserAdmin())) {
    return new NextResponse("Dazu brauchst du Admin-Rechte.", { status: 403 });
  }

  const { clipId, fileName: rawFileName } = await context.params;
  const id = clipId?.trim() ?? "";
  if (!UUID_RE.test(id)) {
    return new NextResponse("Ungültige Clip-ID.", { status: 400 });
  }

  let clip;
  try {
    const clips = await listVideoClips();
    clip = clips.find((c) => c.id === id) ?? null;
  } catch {
    return new NextResponse("Video-Clip nicht gefunden.", { status: 404 });
  }
  if (!clip?.storagePath) {
    return new NextResponse("Video-Clip nicht gefunden.", { status: 404 });
  }

  const fromPath = decodeURIComponent(rawFileName ?? "")
    .replace(/\.mp4$/i, "")
    .trim();
  const dispositionTitle =
    clip.title.trim() ||
    (fromPath ? sanitizeMp4Basename(fromPath) : "Video-Clip");

  const storage = createServiceClient(null).storage.from(VIDEO_CLIPS_BUCKET);
  const { data: file, error: downloadError } = await storage.download(
    clip.storagePath,
  );
  if (downloadError || !file) {
    return new NextResponse(
      downloadError?.message ?? "Video konnte nicht geladen werden.",
      { status: 404 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": clip.mimeType || VIDEO_CLIPS_MIME,
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": attachmentMp4ContentDisposition(dispositionTitle),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
