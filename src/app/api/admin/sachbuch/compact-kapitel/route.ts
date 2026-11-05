/**
 * Condense one chapter of a compact edition (Haiku).
 * One hop per chapter so a full book does not die in a single request.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { condenseSachbuchCompactKapitel } from "@/lib/sachbuch/compact";
import { slimSachbuchKontextForTransport } from "@/lib/sachbuch/parse";
import { patchSachbuchKapitel } from "@/lib/sachbuch/repository";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";

export const runtime = "nodejs";
/** One chapter: draft plus up to two length retries. */
export const maxDuration = 800;

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
    const book = await condenseSachbuchCompactKapitel(parsed.data);
    revalidateSachbuchAdmin(book.id);
    return NextResponse.json({
      success: true,
      book: slimSachbuchKontextForTransport(book, {
        keepKapitelIds: [parsed.data.kapitelId],
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kapitel kürzen fehlgeschlagen.";
    try {
      await patchSachbuchKapitel(parsed.data.sachbuchId, parsed.data.kapitelId, {
        status: "error",
        generationError: message.slice(0, 500),
      });
    } catch {
      // Status chip is best-effort; the response still carries the error.
    }
    revalidateSachbuchAdmin(parsed.data.sachbuchId);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
