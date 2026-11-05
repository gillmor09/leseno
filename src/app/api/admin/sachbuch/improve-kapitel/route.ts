/**
 * Improve one manuscript chapter (Argon Lektorat).
 * Prefer this over the Server Action for long runs: one hop per chapter
 * avoids browser/Next aborting a multi-chapter improve-all.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  improveSachbuchKapitelManuscript,
  SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS,
} from "@/lib/sachbuch/manuscript";
import { slimSachbuchKontextForTransport } from "@/lib/sachbuch/parse";
import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";

export const runtime = "nodejs";
/** Argon chapter rewrite can take many minutes. */
export const maxDuration = 1800;

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
    const book = await improveSachbuchKapitelManuscript({
      ...parsed.data,
      extraChangeOrders: [...SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS],
    });
    revalidateSachbuchAdmin(book.id);
    return NextResponse.json({
      success: true,
      book: slimSachbuchKontextForTransport(book, {
        keepKapitelIds: [parsed.data.kapitelId],
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
            : "Kapitel-Verbesserung fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
