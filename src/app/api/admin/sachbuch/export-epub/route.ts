/**
 * Build Sachbuch ePub from DB (full prose — client state is slimmed).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { buildSachbuchEpubBlob } from "@/lib/sachbuch/export-build";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  sachbuchId: z.string().regex(UUID_RE),
  /** false = Veröffentlichung (Tolino); true = mit Cover-Bild. */
  includeCover: z.boolean().optional().default(false),
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
        { error: "Sachbuch nicht gefunden." },
        { status: 404 },
      );
    }
    const { blob, filename } = await buildSachbuchEpubBlob(book, {
      includeCover: parsed.data.includeCover,
    });
    const buf = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ePub-Export fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
