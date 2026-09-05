import { headers } from "next/headers";

/** Canonical production origin for auth emails when env is unset. */
export const DEFAULT_PUBLIC_SITE_URL = "https://leseno.de";

/**
 * Public origin for in-app redirects (Stripe return, etc.).
 * Prefer the current request host so Coolify / local match the browser.
 */
export async function getSiteUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const isLocal =
    Boolean(host?.includes("localhost")) || Boolean(host?.startsWith("127."));
  const proto =
    headerStore.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");

  if (host) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return getAuthEmailSiteUrl();
}

/**
 * Origin for auth emails (signup / recovery): never localhost.
 * Prefer `NEXT_PUBLIC_SITE_URL`, else production.
 */
export function getAuthEmailSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return DEFAULT_PUBLIC_SITE_URL;
}

/**
 * Rewrites localhost/127.0.0.1 origins in a URL to the public site (keeps path/query).
 */
export function rewriteLocalOriginToPublicSite(
  url: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const local =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
    if (!local) return trimmed;
    const pub = new URL(publicSiteUrl);
    parsed.protocol = pub.protocol;
    parsed.host = pub.host;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Ensures Supabase `action_link` / verify URLs redirect back to the public site.
 */
export function ensureAuthLinkUsesPublicSite(
  actionLink: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = actionLink.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    const redirectTo = url.searchParams.get("redirect_to");
    if (redirectTo) {
      url.searchParams.set(
        "redirect_to",
        rewriteLocalOriginToPublicSite(redirectTo, publicSiteUrl),
      );
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}
