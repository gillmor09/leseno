/**
 * Poll Kapitel generation progress from DB (shared across Action + Route).
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const sachbuchId = url.searchParams.get("sachbuchId")?.trim() ?? "";
  const kapitelId = url.searchParams.get("kapitelId")?.trim() ?? "";
  if (!UUID_RE.test(sachbuchId) || !UUID_RE.test(kapitelId)) {
    return NextResponse.json(
      { error: "Ungültige Sachbuch- oder Kapitel-ID." },
      { status: 400 },
    );
  }

  try {
    const book = await getSachbuchKontext(sachbuchId);
    const kapitel = book?.kapitel.find((k) => k.id === kapitelId);
    if (!book || !kapitel) {
      return NextResponse.json(
        { error: "Kapitel nicht gefunden." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      status: kapitel.status,
      progressLabel: kapitel.generationProgress,
      error: kapitel.generationError,
      generationJobId: kapitel.generationJobId,
      hasFinal: Boolean(kapitel.finalText.trim()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Fortschritt laden fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
