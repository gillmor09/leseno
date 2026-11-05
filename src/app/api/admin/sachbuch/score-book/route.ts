/**
 * Holistic book Verkaufsreife score (Argon). One hop after improve-all.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { scoreSachbuchBookManuscript } from "@/lib/sachbuch/manuscript";
import { slimSachbuchKontextForTransport } from "@/lib/sachbuch/parse";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";

export const runtime = "nodejs";
export const maxDuration = 1800;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  sachbuchId: z.string().regex(UUID_RE),
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
    const book = await scoreSachbuchBookManuscript(parsed.data.sachbuchId);
    revalidateSachbuchAdmin(book.id);
    return NextResponse.json({
      success: true,
      book: slimSachbuchKontextForTransport(book, { stripAllProse: true }),
    });
  } catch (error) {
    revalidateSachbuchAdmin(parsed.data.sachbuchId);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Buch-Score fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
