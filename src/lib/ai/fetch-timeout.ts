/**
 * Shared AbortSignal for AI HTTP calls so hung providers don't lock the UI forever.
 * Uses AbortController + setTimeout (more reliable than AbortSignal.timeout alone
 * under Next.js / undici on long Claude / OpenAI prose runs).
 */

/** Default hard cap per AI request (OpenAI / Claude). */
export const AI_FETCH_TIMEOUT_MS = 300_000;

/**
 * Absolute max when a caller opts into a longer budget
 * (Manuskript-Prosa / greenfield Novel draft / Reifegrad / Gemini 4 Argon).
 * Google recommends ≥20 min wall-clock for `gemini-4-argon`.
 */
export const AI_FETCH_TIMEOUT_MAX_MS = 1_200_000;

/** Recommended budget for long chapter prose (OpenAI / Co-Autor / Novel-Autor). */
export const AI_LONG_PROSE_TIMEOUT_MS = 480_000;

/** Default wall-clock for Gemini 4 Argon (explicit cache off, long decode). */
export const GEMINI_4_ARGON_TIMEOUT_MS = 1_200_000;

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

/**
 * Transient transport failures worth a short retry (Claude / Gemini / undici).
 * Does not include Abort/Timeout — those should fail the call immediately.
 */
export function isRetryableAiNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isAiAbortError(error)) return false;
  const message = error.message.toLowerCase();
  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("und_err") ||
    message.includes("network")
  ) {
    return true;
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code ?? "";
    if (
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      code === "UND_ERR_SOCKET" ||
      code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      return true;
    }
    return isRetryableAiNetworkError(cause);
  }
  return false;
}

/** HTTP statuses that are often transient on AI provider APIs. */
export function isRetryableAiHttpStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 529
  );
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
