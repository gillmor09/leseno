/**
 * Client-side promo capture via `?promo=` (mirrors referral soft capture).
 */

export const PROMO_QUERY_PARAM = "promo";
export const PROMO_STORAGE_KEY = "leseno_promo";

const CODE_MAX = 64;
const CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function normalizePromoCode(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || trimmed.length > CODE_MAX || !CODE_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function persistPromoCode(code: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizePromoCode(code);
  if (!normalized) return;
  try {
    window.localStorage.setItem(PROMO_STORAGE_KEY, normalized);
  } catch {
    /* private mode / quota */
  }
}

export function readStoredPromoCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizePromoCode(window.localStorage.getItem(PROMO_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredPromoCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Public signup / landing URL with promo query. */
export function buildPromoUrl(promoCode: string, path = "/"): string {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://leseno.de";
  const code = normalizePromoCode(promoCode);
  if (!code) return `${origin}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${origin}${path}${sep}${PROMO_QUERY_PARAM}=${encodeURIComponent(code)}`;
}
