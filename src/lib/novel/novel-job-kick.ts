/**
 * HTTP self-kick for novel orchestrator hops (fresh maxDuration).
 * Falls back to Next.js `after()` when local/prod HTTP kick fails
 * (missing secret, wrong SITE_URL, or localhost unreachable from the action).
 * Failed continue-kicks mark `pipeline_stall` so the UI can auto-resume.
 */

import {
  getInternalJobSecret,
  LESENO_INTERNAL_JOB_HEADER,
} from "@/lib/roman/pipeline/generate-budget";
import type { NovelJobHop, OrchestratorStatus } from "@/lib/novel/types";
import { DEFAULT_PUBLIC_SITE_URL } from "@/lib/site-url";

function resolveContinueBaseUrl(requestUrl?: string): string {
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* fall through */
    }
  }
  const env =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_PUBLIC_SITE_URL;
}

/**
 * Persist a recoverable stall when the hop chain cannot self-kick.
 * Keeps step/scene cursor so Fortsetzen / auto-resume retries the same hop.
 */
export async function markNovelPipelineStall(input: {
  novelId: string;
  hop: NovelJobHop;
  reason: string;
}): Promise<void> {
  try {
    const { getNovelBundle, setOrchestratorStatus } = await import(
      "@/lib/novel/repository"
    );
    const bundle = await getNovelBundle(input.novelId);
    if (!bundle) return;
    // Intentional HITL gates — do not overwrite.
    const halt = bundle.novel.orchestratorStatus.haltReason;
    if (
      halt === "skeleton_gate" ||
      halt === "structure_gate" ||
      halt === "logic_gate" ||
      halt === "chapter_gate" ||
      halt === "manual_pause"
    ) {
      return;
    }
    if (bundle.novel.status === "paused" && halt) return;

    const orch = bundle.novel.orchestratorStatus;
    const step = input.hop.step || orch.step || "architect_acts";
    const phase = (
      step === "architect_acts" ||
      step === "architect_chapters" ||
      step === "architect_manifests" ||
      step === "skeleton_audit_acts" ||
      step === "skeleton_audit_chapters" ||
      step === "skeleton_audit_manifests" ||
      step === "compile_prose_briefs" ||
      step === "scene_dispatch" ||
      step === "scene_draft" ||
      step === "logic_audit" ||
      step === "style_polish" ||
      step === "scene_tic_scrub" ||
      step === "formel_tic_scrub" ||
      step === "state_commit" ||
      step === "chapter_audit" ||
      step === "chapter_revise"
        ? step
        : orch.phase === "idle" || orch.phase === "completed"
          ? "error"
          : orch.phase
    ) as OrchestratorStatus["phase"];

    const novelStatus =
      phase.startsWith("architect_") ||
      phase.startsWith("skeleton_audit_") ||
      phase === "compile_prose_briefs" ||
      phase === "prose_pending"
        ? "outlining"
        : phase === "error"
          ? "error"
          : "writing";

    await setOrchestratorStatus(
      input.novelId,
      {
        phase,
        label: `Pipeline unterbrochen — Auto-Fortsetzung bereit (${step}).`,
        step,
        chapterNumber: input.hop.chapterNumber ?? orch.chapterNumber ?? null,
        sceneId: input.hop.sceneId ?? orch.sceneId ?? null,
        iteration: input.hop.iteration ?? orch.iteration ?? null,
        error: input.reason.slice(0, 240),
        haltReason: "pipeline_stall",
      },
      novelStatus,
    );
  } catch (err) {
    console.error("[novel-job-kick] markNovelPipelineStall failed", err);
  }
}

/** POST `/api/admin/roman/novel-job` with internal secret. */
export async function kickNovelJobHttp(input: {
  hop: NovelJobHop;
  requestUrl?: string;
  delayMs?: number;
}): Promise<boolean> {
  const secret = getInternalJobSecret();
  if (!secret) {
    console.error(
      "[novel-job-kick] No LESENO_INTERNAL_JOB_SECRET / service role — cannot HTTP-kick.",
    );
    return false;
  }

  if (input.delayMs && input.delayMs > 0) {
    await new Promise((r) => setTimeout(r, input.delayMs));
  }

  const port = process.env.PORT?.trim() || "3000";
  const localOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  const publicOrigin = resolveContinueBaseUrl(input.requestUrl);
  // Local `next dev`: prefer localhost first — SITE_URL often points at production.
  const origins =
    process.env.NODE_ENV === "development"
      ? [...localOrigins, publicOrigin]
      : [publicOrigin, ...localOrigins];
  const uniqueOrigins = [...new Set(origins.filter(Boolean))];
  const payload = JSON.stringify(input.hop);

  // More rounds: origins × attempts with backoff (Coolify/proxy blips, cold start).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1_200 * attempt));
    }
    for (const origin of uniqueOrigins) {
      try {
        const res = await fetch(`${origin}/api/admin/roman/novel-job`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [LESENO_INTERNAL_JOB_HEADER]: secret,
          },
          body: payload,
        });
        if (res.status === 202 || res.ok) return true;
        console.warn(
          "[novel-job-kick] non-OK",
          origin,
          res.status,
          `attempt=${attempt + 1}`,
        );
      } catch (err) {
        console.warn("[novel-job-kick] hop failed", origin, err);
      }
    }
  }
  return false;
}

/**
 * Prefer HTTP kick (fresh maxDuration). If that fails, schedule the hop via
 * `after()` and chain continues the same way — unblocks local Server Actions
 * when SITE_URL points at prod or the secret is missing for HTTP.
 */
export async function enqueueNovelJobHop(input: {
  hop: NovelJobHop;
  requestUrl?: string;
  delayMs?: number;
}): Promise<boolean> {
  const kicked = await kickNovelJobHttp(input);
  if (kicked) return true;

  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        if (input.delayMs && input.delayMs > 0) {
          await new Promise((r) => setTimeout(r, input.delayMs));
        }
        const { runNovelOrchestratorHop } = await import(
          "@/lib/novel/novelOrchestrator"
        );
        const result = await runNovelOrchestratorHop(input.hop);
        if (result.outcome === "continue") {
          const ok = await enqueueNovelJobHop({
            hop: result.hop,
            requestUrl: input.requestUrl,
            delayMs:
              result.hop.delayMs ??
              ((result.hop.retry ?? 0) > 0 ? 4_000 : 1_200),
          });
          if (!ok) {
            console.error(
              "[novel-job-kick] after() continue enqueue failed",
              result.hop,
            );
            await markNovelPipelineStall({
              novelId: result.hop.novelId,
              hop: result.hop,
              reason: "Self-kick nach after()-Hop fehlgeschlagen.",
            });
          }
        }
      } catch (err) {
        console.error("[novel-job-kick] after() hop error", err);
        await markNovelPipelineStall({
          novelId: input.hop.novelId,
          hop: input.hop,
          reason:
            err instanceof Error
              ? err.message
              : "after()-Hop mit Fehler abgebrochen.",
        });
      }
    });
    console.warn(
      "[novel-job-kick] HTTP kick failed — scheduled hop via after() fallback.",
      input.hop.step,
    );
    return true;
  } catch (err) {
    console.error("[novel-job-kick] after() fallback unavailable", err);
    await markNovelPipelineStall({
      novelId: input.hop.novelId,
      hop: input.hop,
      reason:
        err instanceof Error
          ? err.message
          : "HTTP- und after()-Kick fehlgeschlagen.",
    });
    return false;
  }
}
