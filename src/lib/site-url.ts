import { headers } from "next/headers";

/**
 * Public origin for Supabase auth redirects.
 * Uses the current request host first so local sign-up mails return to
 * localhost instead of production (`NEXT_PUBLIC_SITE_URL`).
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

  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
