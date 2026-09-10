/**
 * Cookie session for child login (Kennung + password) — not Supabase Auth.
 * Payload is HMAC-signed; no registration / invite side effects.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "leseno_child_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

export type ChildSessionPayload = {
  parentUserId: string;
  profileId: string;
  displayName: string;
  loginCode: string;
  exp: number;
};

function signingSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "leseno-child-session-dev"
  );
}

function sign(body: string): string {
  return createHmac("sha256", signingSecret()).update(body).digest("hex");
}

function encodePayload(payload: ChildSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

function decodePayload(raw: string): ChildSessionPayload | null {
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ChildSessionPayload>;
    if (
      typeof parsed.parentUserId !== "string" ||
      typeof parsed.profileId !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.loginCode !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Date.now()) return null;
    return {
      parentUserId: parsed.parentUserId,
      profileId: parsed.profileId,
      displayName: parsed.displayName,
      loginCode: parsed.loginCode,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/** Sets httpOnly child session after Kennung + password verify. */
export async function setChildSessionCookie(
  payload: Omit<ChildSessionPayload, "exp">,
): Promise<void> {
  const jar = await cookies();
  const full: ChildSessionPayload = {
    ...payload,
    exp: Date.now() + MAX_AGE_SEC * 1000,
  };
  jar.set(COOKIE_NAME, encodePayload(full), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Clears child session cookie. */
export async function clearChildSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** Valid child session or null. */
export async function readChildSessionCookie(): Promise<ChildSessionPayload | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return decodePayload(value);
}
