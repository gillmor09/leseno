/**
 * Soft referral attribution via `?ref=` (no reward DB in v1).
 * Code is stored in localStorage until signup; logged on `auth.sign_up`.
 */

export const REFERRAL_QUERY_PARAM = "ref";
export const REFERRAL_STORAGE_KEY = "leseno_ref";

const CODE_MAX = 64;
const CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Public origin for invite links (never localhost, never :3000).
 */
export function getMarketingOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured.replace(/\/$/, ""));
      if (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]"
      ) {
        return "https://leseno.de";
      }
      if (url.port === "3000" || url.port === "3001" || url.port === "8080") {
        url.port = "";
      }
      return url.origin;
    } catch {
      // fall through
    }
  }
  return "https://leseno.de";
}

/**
 * Normalizes a referral code from the query string.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || trimmed.length > CODE_MAX || !CODE_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

/**
 * Short stable code from a Supabase user id (UUID).
 */
export function referralCodeFromUserId(userId: string): string {
  const hex = userId.replace(/-/g, "").toLowerCase();
  return hex.slice(0, 10) || "leseno";
}

/**
 * Invite URL for landing (optionally with personal ref).
 */
export function buildInviteUrl(referralCode?: string | null): string {
  const origin = getMarketingOrigin();
  const code = normalizeReferralCode(referralCode ?? null);
  if (!code) return `${origin}/?utm_source=share&utm_medium=invite`;
  return `${origin}/?${REFERRAL_QUERY_PARAM}=${encodeURIComponent(code)}&utm_source=share&utm_medium=invite`;
}

/**
 * Signup URL preserving referral.
 */
export function buildSignupUrl(referralCode?: string | null): string {
  const origin = getMarketingOrigin();
  const code = normalizeReferralCode(referralCode ?? null);
  if (!code) return `${origin}/registrieren`;
  return `${origin}/registrieren?${REFERRAL_QUERY_PARAM}=${encodeURIComponent(code)}`;
}

export function persistReferralCode(code: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
  } catch {
    // private mode / quota
  }
}

export function readStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferralCode(
      window.localStorage.getItem(REFERRAL_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}
