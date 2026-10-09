/**
 * Poll live Erzeugen progress while a background generate job runs.
 * Reads pipeline history (DB) — shared across Action / `after` job / Route.
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import {
  getPipelineHistoryRun,
  latestProgressLabelForPoll,
  latestRunErrorSummary,
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
    const status = run?.status ?? null;
    return NextResponse.json({
      progressLabel: latestProgressLabelForPoll(run),
      status,
      error: status === "error" ? latestRunErrorSummary(run) : null,
      draftSummary:
        [...(run?.events ?? [])]
          .reverse()
          .find((e) => e.type === "draft" && e.summary.trim())?.summary ?? null,
      reifeSummary:
        [...(run?.events ?? [])]
          .reverse()
          .find(
            (e) =>
              e.type === "info" &&
              e.roleKey === "bewerter" &&
              e.summary.startsWith("Reifegrad:"),
          )?.summary ?? null,
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
