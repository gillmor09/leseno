/**
 * API-key auth for the public blog create endpoint (`BLOG_API_KEY`).
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Reads `Authorization: Bearer …` or `X-Api-Key`.
 * Returns null when neither header is present.
 */
export function extractBlogApiKey(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(bearer);
  if (match?.[1]?.trim()) return match[1].trim();
  const headerKey = request.headers.get("x-api-key")?.trim() ?? "";
  return headerKey || null;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * True when the request presents the configured `BLOG_API_KEY`.
 * False when the env is missing or the key does not match.
 */
export function isValidBlogApiKey(presented: string | null): boolean {
  const expected = process.env.BLOG_API_KEY?.trim() ?? "";
  if (!expected || !presented) return false;
  return safeEqualString(presented, expected);
}
