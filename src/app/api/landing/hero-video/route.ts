/**
 * Public playback for the landing hero clip (whitelisted admin video).
 * Redirects to a short-lived signed Storage URL.
 */

import { NextResponse } from "next/server";
import { findLandingHeroVideoClip } from "@/lib/video-clips/landing-hero";
import { createVideoClipSignedUrl } from "@/lib/video-clips/storage";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  if (!hasServiceRoleConfig()) {
    return new NextResponse("Video gerade nicht verfügbar.", { status: 503 });
  }

  try {
    const clip = await findLandingHeroVideoClip();
    if (!clip?.storagePath) {
      return new NextResponse("Hero-Video nicht gefunden.", { status: 404 });
    }
    const signedUrl = await createVideoClipSignedUrl(clip.storagePath);
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Hero-Video fehlgeschlagen.";
    console.error("[landing/hero-video]", message);
    return new NextResponse(message, { status: 500 });
  }
}
