/**
 * Admin: synthesize one Sachbuch Hörbuch track (Abschnitt) → Storage.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/errors/user-facing";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";
import { synthesizeSachbuchHoerbuchTrack } from "@/lib/sachbuch/synthesize-hoerbuch-track";

export const runtime = "nodejs";
export const maxDuration = 3600;

const bodySchema = z.object({
  sachbuchId: z.string().uuid(),
  trackId: z.string().trim().min(1).max(120),
  provider: z.enum(["gemini-tts", "elevenlabs"]).optional(),
  voiceId: z.string().trim().min(1).max(120).optional(),
  style: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Parameter." },
      { status: 400 },
    );
  }

  try {
    const book = await getSachbuchKontext(parsed.data.sachbuchId);
    if (!book) {
      return NextResponse.json(
        { success: false, error: "Sachbuch nicht gefunden." },
        { status: 404 },
      );
    }
    assertSachbuchGuideAllows(book, "hoerbuch");

    const data = await synthesizeSachbuchHoerbuchTrack({
      sachbuchId: parsed.data.sachbuchId,
      trackId: parsed.data.trackId,
      provider: parsed.data.provider,
      voiceId: parsed.data.voiceId,
      style: parsed.data.style,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof UserFacingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Hörbuch-Track fehlgeschlagen.";
    console.error("[sachbuch-hoerbuch/track]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
