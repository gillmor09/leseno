/**
 * Admin TTS voice catalog (JSON). Uses a Route Handler so listing does not
 * block App Router soft-navigation the way a hanging Server Action can.
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { listTtsVoicesForProvider } from "@/lib/ai/tts-voices";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  const provider =
    new URL(request.url).searchParams.get("provider")?.trim() || "";
  if (!provider) {
    return NextResponse.json({ error: "Provider fehlt." }, { status: 400 });
  }

  try {
    const voices = await listTtsVoicesForProvider(provider);
    return NextResponse.json({ voices });
  } catch (error) {
    console.error("[api/admin/tts-voices]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stimmen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}
