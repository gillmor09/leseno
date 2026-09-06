/**
 * Preview cookie for Advent books (parent PIN unlock).
 * Cookie value is an HMAC bound to user + book; verified server-side only.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "advent_preview_";
const MAX_AGE_SEC = 60 * 60 * 24 * 40; // ~ through Advent season

function signingSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "leseno-advent-dev"
  );
}

function cookieName(bookId: string): string {
  return `${COOKIE_PREFIX}${bookId}`;
}

function signPreviewToken(userId: string, bookId: string): string {
  return createHmac("sha256", signingSecret())
    .update(`advent-preview:${userId}:${bookId}`)
    .digest("hex");
}

/** Sets httpOnly preview cookie after successful PIN check. */
export async function setAdventPreviewCookie(
  userId: string,
  bookId: string,
): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(bookId), signPreviewToken(userId, bookId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Clears preview cookie for one book. */
export async function clearAdventPreviewCookie(bookId: string): Promise<void> {
  const jar = await cookies();
  jar.delete(cookieName(bookId));
}

/** True when a valid preview cookie is present for this user/book. */
export async function hasAdventPreviewCookie(
  userId: string,
  bookId: string,
): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(cookieName(bookId))?.value;
  if (!value) return false;
  const expected = signPreviewToken(userId, bookId);
  try {
    const a = Buffer.from(value, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
