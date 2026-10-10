/**
 * HTTP self-kick for Erzeugen continue / stale-recovery hops.
 * Tries request origin, then localhost (Coolify hairpin).
 */

import {
  getInternalJobSecret,
  LESENO_INTERNAL_JOB_HEADER,
} from "@/lib/roman/pipeline/generate-budget";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import { DEFAULT_PUBLIC_SITE_URL } from "@/lib/site-url";

export type GenerateJobKickBody = {
  romanId: string;
  runId: string;
  stage: PipelineStage;
  generateMode?: "stage" | "spec-chain";
  showAssess?: boolean;
};

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
 * Fire-and-forget friendly: awaits until one origin accepts (202).
 * Returns true when a hop was accepted.
 */
export async function kickGenerateJobHttp(input: {
  body: GenerateJobKickBody;
  requestUrl?: string;
  /** Delay before kick so prior worker can flush DB. */
  delayMs?: number;
}): Promise<boolean> {
  const secret = getInternalJobSecret();
  if (!secret) {
    console.error(
      "[generate-job-kick] No LESENO_INTERNAL_JOB_SECRET / service role — cannot kick.",
    );
    return false;
  }

  if (input.delayMs && input.delayMs > 0) {
    await new Promise((r) => setTimeout(r, input.delayMs));
  }

  const port = process.env.PORT?.trim() || "3000";
  const origins = [
    resolveContinueBaseUrl(input.requestUrl),
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  const uniqueOrigins = [...new Set(origins.filter(Boolean))];
  const payload = JSON.stringify({
    romanId: input.body.romanId,
    runId: input.body.runId,
    stage: input.body.stage,
    generateMode: input.body.generateMode ?? "stage",
    showAssess: input.body.showAssess ?? true,
  });

  let lastError = "";
  for (const origin of uniqueOrigins) {
    const url = `${origin}/api/admin/roman/pipeline-generate-job`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LESENO_INTERNAL_JOB_HEADER]: secret,
        },
        body: payload,
      });
      if (res.ok) return true;
      lastError = `${res.status} ${await res.text().catch(() => "")}`;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "fetch fehlgeschlagen";
    }
  }
  console.error(
    `[generate-job-kick] Kick failed: ${lastError.slice(0, 400)}`,
  );
  return false;
}
