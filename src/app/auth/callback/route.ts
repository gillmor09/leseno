import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthEmailSiteUrl } from "@/lib/site-url";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/anmelden";
  }
  return next;
}

/**
 * Exchanges the Supabase auth `code` for a session cookie, then sends
 * the user to the intended page (usually `/anmelden`).
 *
 * Always redirects to the canonical public origin (`https://leseno.de`).
 * Never uses `request.url` origin — Coolify/Next listen on :3000 and GoTrue
 * may rewrite `redirect_to` to that host:port.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const appOrigin = getAuthEmailSiteUrl();

  const authError =
    url.searchParams.get("error") ||
    url.searchParams.get("error_code") ||
    url.searchParams.get("error_description");

  if (authError) {
    const failed = new URL("/anmelden", appOrigin);
    failed.searchParams.set("bestaetigung", "fehlgeschlagen");
    return NextResponse.redirect(failed);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession", error.message);
      const failed = new URL("/anmelden", appOrigin);
      failed.searchParams.set("bestaetigung", "fehlgeschlagen");
      return NextResponse.redirect(failed);
    }

    const destination = new URL(next, appOrigin);
    destination.searchParams.set("bestaetigt", "1");
    return NextResponse.redirect(destination);
  }

  // No code (expired/invalid verify often lands here without query errors).
  const failed = new URL("/anmelden", appOrigin);
  failed.searchParams.set("bestaetigung", "fehlgeschlagen");
  return NextResponse.redirect(failed);
}
