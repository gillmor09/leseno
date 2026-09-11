import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Supabase SSR proxy — refreshes the session cookie on every request
 * so Server Components always receive a valid (or cleanly absent) session.
 * Without this, stale refresh tokens cause noisy `refresh_token_not_found` errors.
 *
 * Also:
 * - redirects accidental `leseno.de:3000` hits (GoTrue SITE_URL / container port)
 * - canonical host: `www.leseno.de` → `https://leseno.de` (avoid duplicate content)
 */
export async function proxy(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const hostOnly = forwardedHost.split(",")[0]?.trim() ?? "";
  const hostname = hostOnly.replace(/:\d+$/, "").toLowerCase();

  // Prefer apex domain so www and non-www do not serve the same content.
  if (hostname === "www.leseno.de") {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      "https://leseno.de",
    );
    return NextResponse.redirect(target, 308);
  }

  if (/:(3000|3001|8080)$/.test(hostOnly)) {
    if (
      hostname &&
      hostname !== "localhost" &&
      !hostname.startsWith("127.")
    ) {
      const canonicalHost =
        hostname === "www.leseno.de" ? "leseno.de" : hostname;
      const target = new URL(
        request.nextUrl.pathname + request.nextUrl.search,
        `https://${canonicalHost}`,
      );
      return NextResponse.redirect(target, 308);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  try {
    const { url, anonKey } = getSupabasePublicConfig();

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to both the outgoing request (for Server Components) and the
          // response (so the browser receives the refreshed token).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Refreshes the session; errors are intentionally ignored here — the
    // Server Component itself handles the unauthenticated state gracefully.
    await supabase.auth.getUser();
  } catch {
    // Supabase is not reachable or misconfigured — let the request through.
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and public Auth hook endpoints.
    "/((?!_next/static|_next/image|favicon.ico|hooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
