import { headers } from "next/headers";

/** Canonical production origin for auth emails when env is unset or local. */
export const DEFAULT_PUBLIC_SITE_URL = "https://leseno.de";

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

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
 * Prefer `NEXT_PUBLIC_SITE_URL` when it is a public host; else production.
 */
export function getAuthEmailSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const normalized = configured.replace(/\/$/, "");
    try {
      const { hostname } = new URL(normalized);
      if (isLocalHostname(hostname)) {
        return DEFAULT_PUBLIC_SITE_URL;
      }
      return normalized;
    } catch {
      return DEFAULT_PUBLIC_SITE_URL;
    }
  }
  return DEFAULT_PUBLIC_SITE_URL;
}

/**
 * Rewrites the URL origin to the public site (keeps path, query, hash).
 * Empty / invalid input is returned unchanged.
 */
export function forcePublicSiteOrigin(
  url: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const pub = new URL(publicSiteUrl);
    parsed.protocol = pub.protocol;
    parsed.host = pub.host;
    return parsed.toString();
  } catch {
    return trimmed;
  }
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
    if (!isLocalHostname(parsed.hostname)) return trimmed;
    return forcePublicSiteOrigin(trimmed, publicSiteUrl);
  } catch {
    return trimmed;
  }
}

/**
 * Ensures Supabase `action_link` / verify URLs redirect back to the public site.
 * Always rewrites `redirect_to` (GoTrue often embeds SITE_URL=localhost).
 */
export function ensureAuthLinkUsesPublicSite(
  actionLink: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = actionLink.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    if (isLocalHostname(url.hostname)) {
      const pub = new URL(publicSiteUrl);
      url.protocol = pub.protocol;
      url.host = pub.host;
    }
    const redirectTo = url.searchParams.get("redirect_to");
    if (redirectTo) {
      url.searchParams.set(
        "redirect_to",
        forcePublicSiteOrigin(redirectTo, publicSiteUrl),
      );
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}
