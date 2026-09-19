/**
 * Poll live Manuskript „Alles erzeugen“ progress while the draft Server Action runs.
 * Reads pipeline history (DB) — not an in-memory Map (Turbopack/dev isolates
 * do not share Maps between Server Actions and Route Handlers).
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  getPipelineHistoryRun,
  latestLiveProgressLabel,
} from "@/lib/roman/pipeline/history";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId")?.trim() ?? "";
  const romanId = url.searchParams.get("romanId")?.trim() ?? "";
  if (!UUID_RE.test(runId) || !UUID_RE.test(romanId)) {
    return NextResponse.json(
      { error: "Ungültige Lauf- oder Buch-ID." },
      { status: 400 },
    );
  }

  try {
    const run = await getPipelineHistoryRun(romanId, runId);
    return NextResponse.json({
      progressLabel: latestLiveProgressLabel(run),
      status: run?.status ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Fortschritt laden fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
