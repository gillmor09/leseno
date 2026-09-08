/**
 * Streams a saved story TTS MP3 for the signed-in owner.
 * Path ends with `Titel.mp3` so browser download uses the title (not the story id).
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  inlineMp3ContentDisposition,
  sanitizeMp3Basename,
} from "@/lib/stories/tts-download-name";
import {
  getMyStoryTtsMeta,
  STORY_TTS_BUCKET,
  STORY_TTS_MIME,
} from "@/lib/stories/tts-storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ storyId: string; fileName: string }>;
};

function titleFromStoryRow(data: unknown): string {
  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === "object") {
    const title = (row as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return "Geschichte";
}

export async function GET(_request: Request, context: RouteContext) {
  const { storyId, fileName: rawFileName } = await context.params;
  const id = storyId?.trim() ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return new NextResponse("Ungültige Geschichte.", { status: 400 });
  }

  const supabase = await createClient(null);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Nicht angemeldet.", { status: 401 });
  }

  let meta;
  try {
    meta = await getMyStoryTtsMeta(id);
  } catch {
    return new NextResponse("Audio nicht gefunden.", { status: 404 });
  }
  if (!meta?.storagePath) {
    return new NextResponse("Audio nicht gefunden.", { status: 404 });
  }

  const { data: storyData, error: storyError } = await supabase.rpc(
    "get_my_story",
    { p_id: id },
  );
  if (storyError) {
    return new NextResponse("Geschichte nicht gefunden.", { status: 404 });
  }
  const title = titleFromStoryRow(storyData);
  // Prefer DB title; fall back to path segment if it looks like an mp3 name.
  const fromPath = decodeURIComponent(rawFileName ?? "")
    .replace(/\.mp3$/i, "")
    .trim();
  const dispositionTitle =
    title !== "Geschichte"
      ? title
      : fromPath
        ? sanitizeMp3Basename(fromPath)
        : "Geschichte";

  const storage = createServiceClient(null).storage.from(STORY_TTS_BUCKET);
  const { data: file, error: downloadError } = await storage.download(
    meta.storagePath,
  );
  if (downloadError || !file) {
    return new NextResponse(
      downloadError?.message ?? "Audio konnte nicht geladen werden.",
      { status: 404 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": meta.mimeType || STORY_TTS_MIME,
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": inlineMp3ContentDisposition(dispositionTitle),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
