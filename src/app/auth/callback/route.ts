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
 * After signup confirm: sign out again and pass `email` to `/anmelden` so the form
 * shows the new address with an empty password (no previous-account autofill).
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

  function redirectWithCookies(destination: URL) {
    const response = NextResponse.redirect(destination);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  async function finishSignupConfirm(confirmedEmail: string | null | undefined) {
    // Drop the session from verifyOtp so /anmelden is a clean login (empty password).
    await supabase.auth.signOut();
    const destination = new URL("/anmelden", appOrigin);
    destination.searchParams.set("bestaetigt", "1");
    const email = confirmedEmail?.trim();
    if (email) {
      destination.searchParams.set("email", email);
    }
    return redirectWithCookies(destination);
  }

  if (tokenHash && typeRaw && OTP_TYPES.has(typeRaw)) {
    const typesToTry: EmailOtpType[] =
      typeRaw === "signup"
        ? ["signup", "email"]
        : [typeRaw as EmailOtpType];

    let lastError: string | null = null;
    for (const type of typesToTry) {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        if (type === "signup" || type === "email") {
          return finishSignupConfirm(data.user?.email);
        }
        const destination = new URL(next, appOrigin);
        return redirectWithCookies(destination);
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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession", error.message);
      return NextResponse.redirect(failUrl);
    }
    // Signup-style redirects go to anmelden with a clean form.
    if (next === "/anmelden" || next.startsWith("/anmelden?")) {
      return finishSignupConfirm(data.user?.email);
    }
    const destination = new URL(next, appOrigin);
    destination.searchParams.set("bestaetigt", "1");
    return redirectWithCookies(destination);
  }

  console.error("[auth/callback] missing token_hash/code", {
    hasToken: Boolean(tokenHash),
    type: typeRaw || null,
    path: url.pathname,
  });
  return NextResponse.redirect(failUrl);
}
