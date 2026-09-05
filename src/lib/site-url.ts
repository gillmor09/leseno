import { headers } from "next/headers";

/** Canonical production origin for auth emails when env is unset or local. */
export const DEFAULT_PUBLIC_SITE_URL = "https://leseno.de";

/** Next.js / Coolify app ports that must never appear on public auth URLs. */
const APP_DEV_PORTS = new Set(["3000", "3001", "8080"]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Strips localhost and internal app ports so public links stay on :443/:80.
 */
function normalizePublicOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim().replace(/\/$/, ""));
    if (isLocalHostname(url.hostname)) {
      return DEFAULT_PUBLIC_SITE_URL;
    }
    if (APP_DEV_PORTS.has(url.port)) {
      url.port = "";
    }
    return url.origin;
  } catch {
    return null;
  }
}

function originNeedsPublicRewrite(url: URL): boolean {
  return isLocalHostname(url.hostname) || APP_DEV_PORTS.has(url.port);
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
    const fromRequest = normalizePublicOrigin(`${proto}://${host}`);
    if (fromRequest && !isLocal) {
      return fromRequest;
    }
    if (isLocal) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
    return fromRequest ?? getAuthEmailSiteUrl();
  }

  return getAuthEmailSiteUrl();
}

/**
 * Origin for auth emails (signup / recovery): always the public site.
 * Ignores localhost and any :3000 / Coolify container ports.
 */
export function getAuthEmailSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const normalized = normalizePublicOrigin(configured);
    if (normalized) {
      try {
        const host = new URL(normalized).hostname;
        // Production domain: never allow a non-default port.
        if (host === "leseno.de" || host === "www.leseno.de") {
          return DEFAULT_PUBLIC_SITE_URL;
        }
        return normalized;
      } catch {
        return DEFAULT_PUBLIC_SITE_URL;
      }
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
 * Rewrites localhost / 127.0.0.1 / app-dev ports to the public site.
 */
export function rewriteLocalOriginToPublicSite(
  url: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!originNeedsPublicRewrite(parsed)) return trimmed;
    return forcePublicSiteOrigin(trimmed, publicSiteUrl);
  } catch {
    return trimmed;
  }
}

/**
 * Ensures Supabase `action_link` / verify URLs redirect back to the public site.
 * Always rewrites `redirect_to` (GoTrue often embeds SITE_URL=localhost/:3000).
 */
export function ensureAuthLinkUsesPublicSite(
  actionLink: string,
  publicSiteUrl: string = getAuthEmailSiteUrl(),
): string {
  const trimmed = actionLink.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    if (originNeedsPublicRewrite(url)) {
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
