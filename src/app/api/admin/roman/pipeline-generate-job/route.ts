/**
 * Kick off Erzeugen in the background (`after`) and return 202 immediately.
 * Client keeps the wait dialog open and polls `pipeline-progress` until the
 * history run is `ok` or `error`.
 *
 * Manuskript chunk hops: when the worker returns `continue`, this route
 * self-kicks a new request (fresh maxDuration) via internal job header.
 * Stale zombies are recovered from `pipeline-progress` (watchdog).
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { isInternalJobRequest } from "@/lib/roman/pipeline/generate-budget";
import { kickGenerateJobHttp } from "@/lib/roman/pipeline/generate-job-kick";
import { runRomanGenerateJob } from "@/lib/roman/pipeline/generate-job";
import { PIPELINE_STAGES } from "@/lib/roman/pipeline/stages";

export const runtime = "nodejs";
/**
 * Wall-clock for one worker hop (Gerüst/Manuskript drafts can run long).
 * Chunk continue self-kicks a new request before this budget is exhausted.
 */
export const maxDuration = 3600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  romanId: z.string().regex(UUID_RE),
  runId: z.string().regex(UUID_RE),
  stage: z.enum(PIPELINE_STAGES),
  generateMode: z.enum(["stage", "spec-chain"]).default("stage"),
  showAssess: z.boolean().default(true),
});

export async function POST(request: Request) {
  const internal = isInternalJobRequest(request);
  if (!internal && !(await isCurrentUserAdmin())) {
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

  const input = parsed.data;
  const requestUrl = request.url;

  after(async () => {
    try {
      const result = await runRomanGenerateJob({
        romanId: input.romanId,
        runId: input.runId,
        stage: input.stage,
        generateMode: input.generateMode,
        showAssess: input.showAssess,
      });
      if (result.outcome === "continue") {
        await kickGenerateJobHttp({
          requestUrl,
          delayMs: 1_500,
          body: {
            romanId: input.romanId,
            runId: input.runId,
            stage: input.stage,
            generateMode: input.generateMode,
            showAssess: input.showAssess,
          },
        });
      }
    } catch (error) {
      console.error("[pipeline-generate-job] Worker crashed:", error);
    }
  });

  return NextResponse.json(
    { accepted: true, runId: input.runId, continued: internal },
    { status: 202 },
  );
}
