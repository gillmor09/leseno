/**
 * Kick off Manuskript Verbessern (Claude Message Batch) in the background.
 * Client keeps the wait dialog open and polls `pipeline-progress`.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { runManuskriptVerbessernJob } from "@/lib/roman/manuskript-verbessern";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import {
  getPipelineHistoryRun,
  historyEvent,
  updatePipelineHistoryRun,
} from "@/lib/roman/pipeline/history";

export const runtime = "nodejs";
/** Batch can take many minutes; align with generate-job headroom. */
export const maxDuration = 3600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  romanId: z.string().regex(UUID_RE),
  runId: z.string().regex(UUID_RE),
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

  const { romanId, runId } = parsed.data;

  after(async () => {
    try {
      await runManuskriptVerbessernJob({ romanId, runId });
    } catch (error) {
      // Job usually persists status:error itself; only fill a gap.
      try {
        const run = await getPipelineHistoryRun(romanId, runId);
        if (run?.status !== "error" && run?.status !== "ok") {
          const message =
            error instanceof Error
              ? error.message
              : "Verbessern (Batch) fehlgeschlagen.";
          await updatePipelineHistoryRun({
            runId,
            status: "error",
            events: [
              ...(run?.events ?? []),
              historyEvent({
                type: "error",
                stage: "manuskript",
                summary: message,
              }),
            ],
          });
        }
      } catch {
        /* best-effort */
      }
      revalidateRomanAdmin(romanId);
    }
  });

  return NextResponse.json({ accepted: true, runId }, { status: 202 });
}
