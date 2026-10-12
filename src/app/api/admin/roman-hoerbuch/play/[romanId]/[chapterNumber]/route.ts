/**
 * Admin Hörbuch playback with byte-range support.
 * Sanitizes concatenated ElevenLabs MP3s (strip Xing/ID3) so pause/seek work.
 * `?tolino=1` remuxes to stereo 128 kbps for Tolino Media ZIP export.
 */

import { NextResponse } from "next/server";
import { sanitizeMp3ForSeek } from "@/lib/ai/tts-mp3";
import { remuxMp3ForTolino } from "@/lib/ai/tts-tolino-mp3";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  ROMAN_HOERBUCH_BUCKET,
  ROMAN_HOERBUCH_MIME,
  romanHoerbuchObjectPath,
} from "@/lib/roman/hoerbuch-storage";
import { getRomanKontext } from "@/lib/roman/repository";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ romanId: string; chapterNumber: string }>;
};

function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice("bytes=".length).split(",")[0]?.trim() ?? "";
  const [startRaw, endRaw] = spec.split("-");
  let start = startRaw === "" ? NaN : Number(startRaw);
  let end = endRaw === "" || endRaw == null ? NaN : Number(endRaw);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    // suffix: bytes=-N
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start) || start < 0) return null;
    end = Number.isFinite(end) ? end : size - 1;
  }
  if (start >= size) return null;
  end = Math.min(end, size - 1);
  if (end < start) return null;
  return { start, end };
}

export async function GET(request: Request, context: RouteContext) {
  if (!(await isCurrentUserAdmin())) {
    return new NextResponse("Dazu brauchst du Admin-Rechte.", { status: 403 });
  }

  const { romanId, chapterNumber: rawChapter } = await context.params;
  const chapterNumber = Number(rawChapter);
  if (
    !romanId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      romanId,
    ) ||
    !Number.isFinite(chapterNumber) ||
    chapterNumber < 1
  ) {
    return new NextResponse("Ungültige Anfrage.", { status: 400 });
  }

  const roman = await getRomanKontext(romanId, { omitCover: true });
  if (!roman) return new NextResponse("Roman nicht gefunden.", { status: 404 });

  const meta = roman.editorial.hoerbuchAudio?.[String(Math.floor(chapterNumber))];
  const storagePath =
    meta?.storagePath?.trim() ||
    romanHoerbuchObjectPath(romanId, chapterNumber);

  const storage = createServiceClient(null).storage.from(ROMAN_HOERBUCH_BUCKET);
  const { data: file, error } = await storage.download(storagePath);
  if (error || !file) {
    return new NextResponse(
      error?.message ?? "Hörbuch-Kapitel nicht gefunden.",
      { status: 404 },
    );
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const wantTolino =
    new URL(request.url).searchParams.get("tolino") === "1";

  let prepared: Buffer = raw;
  if (wantTolino) {
    try {
      prepared = Buffer.from(await remuxMp3ForTolino(raw));
    } catch (error) {
      console.error("[roman-hoerbuch/play] tolino remux", error);
      return new NextResponse(
        "Hörbuch-MP3 konnte nicht für Tolino aufbereitet werden.",
        { status: 500 },
      );
    }
  }

  const audio = sanitizeMp3ForSeek(prepared);
  const fileName = meta?.fileName?.trim() || `kapitel-${chapterNumber}.mp3`;
  const total = audio.byteLength;
  // Full-file remux for Tolino ZIP — skip range (client fetches whole chapter).
  const range = wantTolino
    ? null
    : parseRange(request.headers.get("range"), total);

  if (range) {
    const { start, end } = range;
    const chunk = Uint8Array.from(audio.subarray(start, end + 1));
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        "Content-Type": meta?.mimeType || ROMAN_HOERBUCH_MIME,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      },
    });
  }

  // Uint8Array: NextResponse BodyInit rejects Node Buffer under current TS DOM libs.
  return new NextResponse(Uint8Array.from(audio), {
    status: 200,
    headers: {
      "Content-Type": meta?.mimeType || ROMAN_HOERBUCH_MIME,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
    },
  });
}
