/**
 * Kick off a Reifegrad-only run in the background (`after`).
 * Used when a stage artifact already exists and only needs scoring.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import {
  historyEvent,
  startPipelineHistoryRun,
} from "@/lib/roman/pipeline/history";
import {
  pipelineStepAssessReifegrad,
  pipelineStepFinish,
} from "@/lib/roman/pipeline/runner";
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
} from "@/lib/roman/pipeline/stages";

export const runtime = "nodejs";
export const maxDuration = 600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  romanId: z.string().regex(UUID_RE),
  stage: z.enum(PIPELINE_STAGES),
  changeSummary: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Parameter." },
      { status: 400 },
    );
  }

  const { romanId, stage, changeSummary } = parsed.data;
  const label = PIPELINE_STAGE_LABELS[stage];
  const first = historyEvent({
    type: "info",
    stage,
    summary: `Reifegrad messen: ${label}`,
  });
  const runId = await startPipelineHistoryRun({
    romanId,
    trigger: "reifegrad_assess",
    originStage: stage,
    firstEvent: first,
  });

  after(async () => {
    try {
      const assessed = await pipelineStepAssessReifegrad({
        romanId,
        stage,
        runId,
        events: [first],
        changeSummary:
          changeSummary?.trim() ||
          `Nachträgliche Reifegrad-Messung für ${label}.`,
      });
      await pipelineStepFinish({
        romanId,
        runId,
        events: assessed.events,
        ok: assessed.status !== "error",
        error: assessed.error,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Reifegrad-Bewertung fehlgeschlagen.";
      try {
        await pipelineStepFinish({
          romanId,
          runId,
          events: [first],
          ok: false,
          error: message,
        });
      } catch {
        /* best-effort */
      }
    }
    revalidateRomanAdmin(romanId);
  });

  return NextResponse.json({ accepted: true, runId }, { status: 202 });
}
