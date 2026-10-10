/**
 * Stale-run watchdog for Erzeugen: if a history run stays `running` without
 * new events longer than a chapter-write budget, treat the worker as dead and
 * kick a continue hop (same runId — Manuskript resume skips finished chapters).
 */

import {
  GENERATE_MAX_CONTINUE_HOPS,
  latestGenerateHop,
} from "@/lib/roman/pipeline/generate-budget";
import { kickGenerateJobHttp } from "@/lib/roman/pipeline/generate-job-kick";
import {
  historyEvent,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
  type PipelineHistoryRun,
} from "@/lib/roman/pipeline/history";
import {
  isGeruestStage,
  isPlotStage,
  normalizePipelineStage,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { getRomanKontext } from "@/lib/roman/repository";
import { missingManuskriptChapterNumbers } from "@/lib/roman/plot-chapters";

/**
 * No new history events → worker assumed dead.
 * Must exceed max chapter write (~10 min) + soft gate headroom.
 */
export const GENERATE_STALE_MS = 15 * 60_000;

/** Debounce repeated stale kicks. */
export const GENERATE_STALE_KICK_COOLDOWN_MS = 90_000;

/** History.detail: per-hop worker claim (avoids double workers on same hop). */
export const GENERATE_WORKER_LOCK_PREFIX = "generate-worker-lock:";

/** History.detail: watchdog just requested a continue hop. */
export const GENERATE_STALE_KICK_DETAIL = "generate-stale-kick";

export function formatGenerateWorkerLockDetail(hop: number): string {
  return `${GENERATE_WORKER_LOCK_PREFIX}${Math.max(1, Math.floor(hop))}`;
}

export function parseGenerateWorkerLockHop(
  detail: string | undefined,
): number | null {
  const raw = (detail ?? "").trim();
  if (!raw.startsWith(GENERATE_WORKER_LOCK_PREFIX)) return null;
  const n = Number(raw.slice(GENERATE_WORKER_LOCK_PREFIX.length));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** Latest event `at` (or run createdAt) as epoch ms. */
export function latestPipelineActivityMs(
  run: PipelineHistoryRun,
): number | null {
  let max = 0;
  for (const e of run.events) {
    const t = e.at ? Date.parse(e.at) : Number.NaN;
    if (Number.isFinite(t) && t > max) max = t;
  }
  const created = Date.parse(run.createdAt);
  if (Number.isFinite(created) && created > max) max = created;
  return max > 0 ? max : null;
}

export function isGenerateRunStale(
  run: PipelineHistoryRun,
  nowMs: number = Date.now(),
  staleMs: number = GENERATE_STALE_MS,
): boolean {
  if (run.status !== "running") return false;
  const at = latestPipelineActivityMs(run);
  if (at == null) return false;
  return nowMs - at >= staleMs;
}

function recentEventMatching(
  events: PipelineHistoryEvent[],
  pred: (e: PipelineHistoryEvent) => boolean,
  withinMs: number,
  nowMs: number,
): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (!pred(e)) continue;
    const t = e.at ? Date.parse(e.at) : Number.NaN;
    if (!Number.isFinite(t)) return true;
    return nowMs - t < withinMs;
  }
  return false;
}

export type StaleWatchdogResult = {
  acted: boolean;
  reason?: string;
  kicked?: boolean;
  progressLabel?: string;
};

async function manuskriptIncomplete(romanId: string): Promise<boolean> {
  const roman = await getRomanKontext(romanId, { omitCover: true });
  if (!roman) return false;
  const plot = (roman.manuskriptRaw ?? "").trim();
  const text = (roman.editorial?.manuskriptText ?? "").trim();
  if (!plot) return false;
  if (!text) return true;
  return missingManuskriptChapterNumbers(plot, text).length > 0;
}

function resolveStageFromRun(run: PipelineHistoryRun): PipelineStage | null {
  const fromOrigin = normalizePipelineStage(run.originStage);
  if (fromOrigin) return fromOrigin;
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    const s = run.events[i]?.stage;
    if (!s) continue;
    const n = normalizePipelineStage(String(s));
    if (n) return n;
  }
  return null;
}

/**
 * If the run is a stale zombie, mark + kick a continue hop (or finish if done).
 * Safe to call from progress polls (debounced).
 */
export async function maybeRecoverStaleGenerateRun(input: {
  run: PipelineHistoryRun;
  requestUrl?: string;
}): Promise<StaleWatchdogResult> {
  const { run } = input;
  const now = Date.now();

  if (run.status !== "running") {
    return { acted: false, reason: "not-running" };
  }

  // Erzeugen-only: Verbessern / Vereinfachen / Assess share originStage
  // "manuskript" but must never be auto-closed as "Manuskript vollständig".
  if (run.trigger !== "auto_generate" && run.trigger !== "cascade_regen") {
    return { acted: false, reason: "trigger-skip" };
  }

  if (!isGenerateRunStale(run, now)) {
    return { acted: false, reason: "fresh" };
  }

  if (latestGenerateHop(run.events) >= GENERATE_MAX_CONTINUE_HOPS) {
    return { acted: false, reason: "max-hops" };
  }

  if (
    recentEventMatching(
      run.events,
      (e) => e.detail === GENERATE_STALE_KICK_DETAIL,
      GENERATE_STALE_KICK_COOLDOWN_MS,
      now,
    )
  ) {
    return { acted: false, reason: "cooldown" };
  }

  const stage = resolveStageFromRun(run);
  if (!stage) {
    return { acted: false, reason: "no-stage" };
  }

  // Only auto-recover draft-heavy stages (chapter / scene loops).
  if (
    stage !== "manuskript" &&
    !isGeruestStage(stage) &&
    !isPlotStage(stage)
  ) {
    return { acted: false, reason: "stage-skip" };
  }

  // Fresh worker-lock on the latest hop → another worker still owns the job.
  const currentHop = latestGenerateHop(run.events);
  if (currentHop >= 1 && hopWorkerLockIsFresh(run.events, currentHop, now)) {
    return { acted: false, reason: "worker-lock-fresh" };
  }

  if (stage === "manuskript") {
    const incomplete = await manuskriptIncomplete(run.romanId);
    if (!incomplete) {
      const events: PipelineHistoryEvent[] = [
        ...run.events.filter((e) => e.detail !== "live-progress"),
        historyEvent({
          type: "info",
          stage: "manuskript",
          summary:
            "Watchdog: Manuskript vollständig — Lauf als fertig markiert (hängender Worker).",
        }),
      ];
      await updatePipelineHistoryRun({
        runId: run.id,
        status: "ok",
        events,
      });
      return {
        acted: true,
        reason: "finished-complete",
        progressLabel: "Manuskript fertig (Watchdog).",
      };
    }
  }

  const staleMin = Math.round(GENERATE_STALE_MS / 60_000);
  const label = `Watchdog: kein Fortschritt seit ≥${staleMin} Min. — starte Fortsetzung …`;
  const events: PipelineHistoryEvent[] = [
    ...run.events.filter((e) => e.detail !== "live-progress"),
    historyEvent({
      type: "info",
      stage,
      summary: label,
      detail: GENERATE_STALE_KICK_DETAIL,
    }),
  ];
  await updatePipelineHistoryRun({
    runId: run.id,
    status: "running",
    events,
  });

  const kicked = await kickGenerateJobHttp({
    requestUrl: input.requestUrl,
    delayMs: 400,
    body: {
      romanId: run.romanId,
      runId: run.id,
      stage,
      generateMode: "stage",
      showAssess: true,
    },
  });

  return {
    acted: true,
    reason: kicked ? "kicked" : "kick-failed",
    kicked,
    progressLabel: label,
  };
}

/**
 * True when another worker already claimed this hop and is still within stale window.
 */
export function hopWorkerLockIsFresh(
  events: PipelineHistoryEvent[],
  hop: number,
  nowMs: number = Date.now(),
  freshMs: number = GENERATE_STALE_MS,
): boolean {
  const want = formatGenerateWorkerLockDetail(hop);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.detail !== want) continue;
    const t = e.at ? Date.parse(e.at) : Number.NaN;
    if (!Number.isFinite(t)) return true;
    return nowMs - t < freshMs;
  }
  return false;
}
