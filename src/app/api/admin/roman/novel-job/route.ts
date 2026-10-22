/**
 * Async novel orchestrator hop: 202 + `after()`, then self-kick on continue.
 * Avoids HTTP timeouts on multi-hour full-book generation.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { isInternalJobRequest } from "@/lib/roman/pipeline/generate-budget";
import { enqueueNovelJobHop } from "@/lib/novel/novel-job-kick";
import {
  initialNovelHop,
  runNovelOrchestratorHop,
} from "@/lib/novel/novelOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 3600;

const bodySchema = z.object({
  novelId: z.string().uuid(),
  step: z.string().min(1).optional(),
  chapterNumber: z.number().int().min(1).optional(),
  sceneId: z.string().uuid().optional(),
  iteration: z.number().int().min(0).max(5).optional(),
  retry: z.number().int().min(0).max(5).optional(),
  delayMs: z.number().int().min(0).max(120_000).optional(),
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

  const hop = parsed.data.step
    ? {
        novelId: parsed.data.novelId,
        step: parsed.data.step,
        chapterNumber: parsed.data.chapterNumber,
        sceneId: parsed.data.sceneId,
        iteration: parsed.data.iteration,
        retry: parsed.data.retry,
        delayMs: parsed.data.delayMs,
      }
    : initialNovelHop(parsed.data.novelId);

  const requestUrl = request.url;

  after(async () => {
    try {
      const result = await runNovelOrchestratorHop(hop);
      if (result.outcome === "continue") {
        const kicked = await enqueueNovelJobHop({
          hop: result.hop,
          requestUrl,
          delayMs:
            result.hop.delayMs ??
            ((result.hop.retry ?? 0) > 0 ? 4_000 : 1_200),
        });
        if (!kicked) {
          console.error(
            "[novel-job] Self-kick failed — marking pipeline_stall.",
            result.hop,
          );
          const { markNovelPipelineStall } = await import(
            "@/lib/novel/novel-job-kick"
          );
          await markNovelPipelineStall({
            novelId: result.hop.novelId,
            hop: result.hop,
            reason: "Self-kick fehlgeschlagen — Auto-Fortsetzung nötig.",
          });
        }
      }
    } catch (error) {
      console.error("[novel-job]", error);
      const { markNovelPipelineStall } = await import(
        "@/lib/novel/novel-job-kick"
      );
      await markNovelPipelineStall({
        novelId: hop.novelId,
        hop,
        reason:
          error instanceof Error
            ? error.message
            : "novel-job after() mit Fehler abgebrochen.",
      });
    }
  });

  return NextResponse.json(
    { ok: true, accepted: true, hop },
    { status: 202 },
  );
}
