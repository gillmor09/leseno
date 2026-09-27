/**
 * Temporary Deepgram auth for browser Nova-3 live STT (admin only).
 * Prefers short-lived grant; falls back to API key for private admin use.
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { getDeepgramApiKey } from "@/lib/sachbuch/deepgram";

export const runtime = "nodejs";

type GrantResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

export async function POST() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  let apiKey: string;
  try {
    apiKey = getDeepgramApiKey();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Deepgram-API-Key fehlt.",
      },
      { status: 500 },
    );
  }

  try {
    const grantRes = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (grantRes.ok) {
      const payload = (await grantRes.json()) as GrantResponse;
      if (payload.access_token) {
        return NextResponse.json({
          token: payload.access_token,
          expiresIn: payload.expires_in ?? 60,
          source: "grant",
        });
      }
    }
  } catch {
    /* fall through to key */
  }

  // Private admin tool fallback when grant API is unavailable.
  return NextResponse.json({
    token: apiKey,
    expiresIn: 60,
    source: "api_key",
  });
}
