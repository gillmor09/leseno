/**
 * Shared AbortSignal for AI HTTP calls so hung providers don't lock the UI forever.
 * Uses AbortController + setTimeout (more reliable than AbortSignal.timeout alone
 * under Next.js / undici on long Claude / OpenAI prose runs).
 */

/** Default hard cap per AI request. */
export const AI_FETCH_TIMEOUT_MS = 90_000;

/**
 * Absolute max when a caller opts into a longer budget
 * (Manuskript-Prosa / Reifegrad on full artifacts).
 */
export const AI_FETCH_TIMEOUT_MAX_MS = 600_000;

/** Recommended budget for long chapter prose (OpenAI / Co-Autor). */
export const AI_LONG_PROSE_TIMEOUT_MS = 300_000;

/**
 * Clamp a caller budget into [1s, max]. Invalid / missing → default.
 */
export function resolveAiTimeoutMs(
  timeoutMs: number | undefined | null,
  fallback: number = AI_FETCH_TIMEOUT_MS,
): number {
  const raw =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
      ? timeoutMs
      : fallback;
  return Math.max(1_000, Math.min(Math.round(raw), AI_FETCH_TIMEOUT_MAX_MS));
}

/**
 * AbortSignal that fires after `timeoutMs`.
 * Prefer passing a remaining-budget ms when retrying inside one user action.
 */
export function aiFetchSignal(
  timeoutMs: number = AI_FETCH_TIMEOUT_MS,
): AbortSignal {
  const ms = resolveAiTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(
        `Timeout after ${Math.round(ms / 1000)}s`,
        "TimeoutError",
      ),
    );
  }, ms);
  // Unref so a leaked timer cannot keep the Node process alive in scripts.
  if (typeof timer === "object" && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }
  const signal = controller.signal;
  signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
  return signal;
}

/** True when fetch failed because of our timeout / abort. */
export function isAiAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  return /aborted|timeout/i.test(error.message);
}

/** Prefer the seconds encoded in our Abort reason over a stale caller arg. */
function timeoutSecsFromError(
  error: unknown,
  timeoutMs: number,
): number {
  const msg =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : "";
  const match = msg.match(/Timeout after (\d+)\s*s/i);
  if (match?.[1]) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Math.round(resolveAiTimeoutMs(timeoutMs) / 1000);
}

/** Map Abort/Timeout into a German provider error. */
export function mapAiFetchError(
  error: unknown,
  providerLabel: string,
  timeoutMs: number = AI_FETCH_TIMEOUT_MS,
): Error {
  if (isAiAbortError(error)) {
    const secs = timeoutSecsFromError(error, timeoutMs);
    return new Error(
      `${providerLabel}-Anfrage abgebrochen (Timeout nach ${secs}s). Bitte erneut versuchen.`,
    );
  }
  if (error instanceof Error) return error;
  return new Error(`${providerLabel}-Anfrage fehlgeschlagen.`);
}
