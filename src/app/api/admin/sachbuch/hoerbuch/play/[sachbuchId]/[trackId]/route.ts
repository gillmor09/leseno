/**
 * Stable admin play route for Sachbuch Hörbuch tracks (Accept-Ranges via redirect
 * to a signed Storage URL is enough for playback).
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { createSachbuchHoerbuchSignedUrl } from "@/lib/sachbuch/hoerbuch-storage";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";

export const runtime = "nodejs";

type Params = { params: Promise<{ sachbuchId: string; trackId: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sachbuchId, trackId } = await params;
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const decoded = decodeURIComponent(trackId);
  const isSample = decoded === "__sample__";
  const path = isSample
    ? book.idee.hoerbuch.sample?.storagePath
    : book.idee.hoerbuch.tracks.find((t) => t.id === decoded)?.audio
        ?.storagePath;

  if (!path) {
    return NextResponse.json({ error: "Keine Audiodatei." }, { status: 404 });
  }

  const signed = await createSachbuchHoerbuchSignedUrl(path);
  const url = new URL(request.url);
  // Cache-bust via query is ignored for redirect target.
  void url;
  return NextResponse.redirect(signed, 302);
}
