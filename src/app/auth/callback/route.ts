import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { APP_DB_SCHEMA, getSupabasePublicConfig } from "@/lib/supabase/config";
import { getAuthEmailSiteUrl } from "@/lib/site-url";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/anmelden";
  }
  return next;
}

const OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

/**
 * Completes email confirmation / recovery via `token_hash` (preferred) or PKCE `code`.
 * Session cookies are written onto the redirect response (required for App Router).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash =
    url.searchParams.get("token_hash")?.trim() ||
    url.searchParams.get("token")?.trim() ||
    "";
  const typeRaw = url.searchParams.get("type")?.trim() || "";
  const next = safeNextPath(url.searchParams.get("next"));
  const appOrigin = getAuthEmailSiteUrl();

  const failUrl = new URL("/anmelden", appOrigin);
  failUrl.searchParams.set("bestaetigung", "fehlgeschlagen");

  const authError =
    url.searchParams.get("error") ||
    url.searchParams.get("error_code") ||
    url.searchParams.get("error_description");

  if (authError) {
    console.error("[auth/callback] query error", {
      error: url.searchParams.get("error"),
      error_code: url.searchParams.get("error_code"),
    });
    return NextResponse.redirect(failUrl);
  }

  const pendingCookies: PendingCookie[] = [];
  const { url: supabaseUrl, anonKey } = getSupabasePublicConfig();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    db: { schema: APP_DB_SCHEMA },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendingCookies.push({ name, value, options });
        });
      },
    },
  });

  function redirectWithSession(destination: URL) {
    const response = NextResponse.redirect(destination);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  if (tokenHash && typeRaw && OTP_TYPES.has(typeRaw)) {
    const typesToTry: EmailOtpType[] =
      typeRaw === "signup"
        ? ["signup", "email"]
        : [typeRaw as EmailOtpType];

    let lastError: string | null = null;
    for (const type of typesToTry) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        const destination = new URL(next, appOrigin);
        if (type === "signup" || type === "email") {
          destination.searchParams.set("bestaetigt", "1");
        }
        return redirectWithSession(destination);
      }
      lastError = error.message;
      console.error("[auth/callback] verifyOtp", { type, message: error.message });
    }

    // Token already used / email already confirmed → still allow sign-in.
    if (
      lastError &&
      /expired|invalid|already|confirmed/i.test(lastError)
    ) {
      const destination = new URL("/anmelden", appOrigin);
      destination.searchParams.set("bestaetigt", "1");
      return NextResponse.redirect(destination);
    }

    return NextResponse.redirect(failUrl);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession", error.message);
      return NextResponse.redirect(failUrl);
    }
    const destination = new URL(next, appOrigin);
    destination.searchParams.set("bestaetigt", "1");
    return redirectWithSession(destination);
  }

  console.error("[auth/callback] missing token_hash/code", {
    hasToken: Boolean(tokenHash),
    type: typeRaw || null,
    path: url.pathname,
  });
  return NextResponse.redirect(failUrl);
}
