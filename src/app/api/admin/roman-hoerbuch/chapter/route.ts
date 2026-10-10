/**
 * Admin: synthesize one Hörbuch chapter → Supabase Storage + editorial meta.
 * Long maxDuration so multi-chunk ElevenLabs runs do not die mid-chapter.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/errors/user-facing";
import { synthesizeRomanHoerbuchChapterToStorage } from "@/lib/roman/synthesize-roman-hoerbuch-chapter";

export const runtime = "nodejs";
export const maxDuration = 3600;

const castingSchema = z.record(z.string(), z.string().trim().min(1).max(120));

const bodySchema = z.object({
  romanId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  languageCode: z.string().trim().min(2).max(8),
  proseSource: z.enum(["manuskript", "roman"]).optional(),
  mode: z.enum(["single", "cast"]).optional(),
  casting: castingSchema.optional(),
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
    const data = await synthesizeRomanHoerbuchChapterToStorage({
      romanId: parsed.data.romanId,
      chapterNumber: parsed.data.chapterNumber,
      languageCode: parsed.data.languageCode,
      proseSource: parsed.data.proseSource,
      mode: parsed.data.mode,
      casting: parsed.data.casting,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof UserFacingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Hörbuch-Kapitel fehlgeschlagen.";
    console.error("[roman-hoerbuch/chapter]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
