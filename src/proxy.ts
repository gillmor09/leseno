import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Supabase SSR proxy — refreshes the session cookie on every request
 * so Server Components always receive a valid (or cleanly absent) session.
 * Without this, stale refresh tokens cause noisy `refresh_token_not_found` errors.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

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
    // Skip Next.js internals and all static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
