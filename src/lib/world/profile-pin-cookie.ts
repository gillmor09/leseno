/**
 * Unlock cookie after parent PIN for a child profile.
 * Short-lived so kids cannot stay in an unlocked session forever.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "profile_unlock_";
const MAX_AGE_SEC = 60 * 60 * 2; // 2 hours

function signingSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "leseno-profile-pin-dev"
  );
}

function cookieName(profileId: string): string {
  return `${COOKIE_PREFIX}${profileId}`;
}

function signUnlockToken(userId: string, profileId: string): string {
  return createHmac("sha256", signingSecret())
    .update(`profile-unlock:${userId}:${profileId}`)
    .digest("hex");
}

/** Sets httpOnly unlock cookie after successful PIN check. */
export async function setChildProfileUnlockCookie(
  userId: string,
  profileId: string,
): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(profileId), signUnlockToken(userId, profileId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Clears unlock cookie for one profile. */
export async function clearChildProfileUnlockCookie(
  profileId: string,
): Promise<void> {
  const jar = await cookies();
  jar.delete(cookieName(profileId));
}

/** True when a valid unlock cookie is present for this user/profile. */
export async function hasChildProfileUnlockCookie(
  userId: string,
  profileId: string,
): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(cookieName(profileId))?.value;
  if (!value) return false;
  const expected = signUnlockToken(userId, profileId);
  try {
    const a = Buffer.from(value, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
