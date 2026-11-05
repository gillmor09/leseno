/**
 * Load one chapter with full prose (lazy) for Manuskript / Schreiben UI.
 * Keeps the admin page payload small so the browser does not white-screen.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  sachbuchId: z.string().regex(UUID_RE),
  kapitelId: z.string().regex(UUID_RE),
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
    const kapitel = book.kapitel.find((k) => k.id === parsed.data.kapitelId);
    if (!kapitel) {
      return NextResponse.json(
        { success: false, error: "Kapitel nicht gefunden." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, kapitel });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Kapitel laden fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
