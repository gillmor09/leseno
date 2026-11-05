/**
 * Herstellung one chapter (Haiku layout pass).
 * Prefer this hop over a Server Action for long runs.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  herstellenSachbuchKapitel,
  refreshSachbuchHerstellungBookReview,
} from "@/lib/sachbuch/herstellung";
import { slimSachbuchKontextForTransport } from "@/lib/sachbuch/parse";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";

export const runtime = "nodejs";
export const maxDuration = 1800;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  sachbuchId: z.string().regex(UUID_RE),
  /** Optional when reviewOnly — any chapter id is fine for slim keep. */
  kapitelId: z.string().regex(UUID_RE).optional(),
  /** When true, refresh book-level Herstellung summary after the chapter. */
  refreshBook: z.boolean().optional().default(false),
  /**
   * Skip Haiku — only rebuild `idee.herstellungReview` from DB
   * (used after multi-chapter hops so the client does not re-run the last chapter).
   */
  reviewOnly: z.boolean().optional().default(false),
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
    if (parsed.data.reviewOnly) {
      const book = await refreshSachbuchHerstellungBookReview(
        parsed.data.sachbuchId,
      );
      revalidateSachbuchAdmin(book.id);
      // No chapter prose — client must merge; stamps (hergestelltAt) stay.
      return NextResponse.json({
        success: true,
        book: slimSachbuchKontextForTransport(book, { stripAllProse: true }),
      });
    }

    const kapitelId = parsed.data.kapitelId;
    if (!kapitelId) {
      return NextResponse.json(
        { error: "kapitelId fehlt." },
        { status: 400 },
      );
    }

    let book = await herstellenSachbuchKapitel({
      sachbuchId: parsed.data.sachbuchId,
      kapitelId,
    });
    if (parsed.data.refreshBook) {
      book = await refreshSachbuchHerstellungBookReview(parsed.data.sachbuchId);
    }
    revalidateSachbuchAdmin(book.id);
    return NextResponse.json({
      success: true,
      book: slimSachbuchKontextForTransport(book, {
        keepKapitelIds: [kapitelId],
      }),
    });
  } catch (error) {
    revalidateSachbuchAdmin(parsed.data.sachbuchId);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Herstellung fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
