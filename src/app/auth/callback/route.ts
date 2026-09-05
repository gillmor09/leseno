import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthEmailSiteUrl,
  rewriteLocalOriginToPublicSite,
} from "@/lib/site-url";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/anmelden";
  }
  return next;
}

/**
 * Exchanges the Supabase auth `code` for a session cookie, then sends
 * the user to the intended page (usually `/anmelden`).
 * Never keeps the browser on localhost or :3000 after email confirmation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const publicOrigin = getAuthEmailSiteUrl();
  // Prefer public origin whenever the request host is local / :3000.
  const appOrigin = rewriteLocalOriginToPublicSite(url.origin, publicOrigin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const failed = new URL("/anmelden", appOrigin);
      failed.searchParams.set("bestaetigung", "fehlgeschlagen");
      return NextResponse.redirect(failed);
    }
  }

  const destination = new URL(next, appOrigin);
  destination.searchParams.set("bestaetigt", "1");
  return NextResponse.redirect(destination);
}
