/**
 * Wall-clock budget for long Erzeugen jobs (Manuskript / Gerüst).
 * One `after()` worker stops before the platform maxDuration kill, persists
 * progress, and a new HTTP kick continues the same history runId.
 */

/** Soft budget per worker hop — leave headroom under route maxDuration 3600. */
export const GENERATE_CHUNK_BUDGET_MS = 45 * 60_000;

/** History.detail marker: chunk ended on purpose; another hop should start. */
export const GENERATE_CONTINUE_DETAIL = "generate-chunk-continue";

/** History.detail prefix: hop counter for loop safety. */
export const GENERATE_HOP_PREFIX = "GENERATE_HOP:";

/** Hard cap on automatic continue hops (~18h at 45m). */
export const GENERATE_MAX_CONTINUE_HOPS = 24;

/** Internal self-kick auth header (value = LESENO_INTERNAL_JOB_SECRET or service role). */
export const LESENO_INTERNAL_JOB_HEADER = "x-leseno-internal-job";

/**
 * Thrown when the chunk budget is exhausted (or mid-book abort should auto-continue).
 * Must not mark the pipeline run as terminal `error`.
 */
export class GenerateChunkContinueError extends Error {
  readonly code = "GENERATE_CHUNK_CONTINUE" as const;

  constructor(
    message: string,
    public readonly meta?: {
      chaptersDone?: number;
      chaptersTotal?: number;
      reason?: string;
    },
  ) {
    super(message);
    this.name = "GenerateChunkContinueError";
  }
}

export function isGenerateChunkContinueError(
  error: unknown,
): error is GenerateChunkContinueError {
  return (
    error instanceof GenerateChunkContinueError ||
    (Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: string }).code === "GENERATE_CHUNK_CONTINUE")
  );
}

export type GenerateChunkBudget = {
  deadlineMs: number;
  /** Throws GenerateChunkContinueError when wall clock is past the deadline. */
  assertCanStartUnit: (unitLabel: string) => void;
  remainingMs: () => number;
};

/** Create a per-worker budget (call once at hop start). */
export function createGenerateChunkBudget(
  budgetMs: number = GENERATE_CHUNK_BUDGET_MS,
): GenerateChunkBudget {
  const started = Date.now();
  const deadlineMs = started + Math.max(60_000, budgetMs);
  return {
    deadlineMs,
    remainingMs: () => deadlineMs - Date.now(),
    assertCanStartUnit: (unitLabel: string) => {
      if (Date.now() < deadlineMs) return;
      throw new GenerateChunkContinueError(
        `Zeitbudget für diesen Worker erreicht — Checkpoint vor „${unitLabel}“. Automatische Fortsetzung …`,
        { reason: "budget" },
      );
    },
  };
}

export function formatGenerateHopDetail(hop: number): string {
  return `${GENERATE_HOP_PREFIX}${Math.max(0, Math.floor(hop))}`;
}

export function parseGenerateHop(detail: string | undefined): number | null {
  const raw = (detail ?? "").trim();
  if (!raw.startsWith(GENERATE_HOP_PREFIX)) return null;
  const n = Number(raw.slice(GENERATE_HOP_PREFIX.length));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Latest hop index recorded on this run (0 if none). */
export function latestGenerateHop(
  events: Array<{ detail?: string }>,
): number {
  let max = 0;
  for (const e of events) {
    const hop = parseGenerateHop(e.detail);
    if (hop != null && hop > max) max = hop;
  }
  return max;
}

export function getInternalJobSecret(): string | null {
  const a = process.env.LESENO_INTERNAL_JOB_SECRET?.trim();
  if (a) return a;
  const b = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return b || null;
}

export function isInternalJobRequest(request: Request): boolean {
  const secret = getInternalJobSecret();
  if (!secret) return false;
  return request.headers.get(LESENO_INTERNAL_JOB_HEADER)?.trim() === secret;
}
