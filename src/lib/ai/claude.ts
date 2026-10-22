/**
 * Anthropic Messages API client for Claude text models.
 * Auth: `CLAUDE_API_KEY` (Coolify / `.env.local`).
 * Retries transient network drops (ECONNRESET) — common on long Sonnet runs.
 */

import {
  AI_FETCH_TIMEOUT_MAX_MS,
  AI_FETCH_TIMEOUT_MS,
  aiFetchSignal,
  isAiAbortError,
  mapAiFetchError,
} from "@/lib/ai/fetch-timeout";
import {
  isClaudeHaiku55Slug,
  isClaudeOpus55Slug,
  isClaudeSonnet55Slug,
} from "@/lib/ai/reasoning-effort";
import { recordAiUsage } from "@/lib/ai/usage";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
/** Shared with Message Batches client (`claude-batches.ts`). */
export const ANTHROPIC_VERSION = "2023-06-01";
/** At most one retry — shared wall-clock budget must not multiply to minutes. */
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 1_500;
const MIN_RETRY_BUDGET_MS = 12_000;

export type ClaudeGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  /**
   * Stable book bible (Idee/Recherche/Spec/Ton). Marked with
   * `cache_control: ephemeral` so Anthropic prompt-caching can reuse it
   * across Gerüst batches / Verbessern turns.
   */
  cacheablePrefix?: string;
  /**
   * Prompt-cache TTL for `cacheablePrefix` breakpoint.
   * Prefer `1h` for Message Batches (often longer than default 5m).
   */
  cacheTtl?: "5m" | "1h";
  userText: string;
  jsonOutput?: boolean;
  /** Cap output size (default 8192). Lower for feedback/summary. */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
  /**
   * Claude 5.5 family `output_config.effort` (low|medium|high).
   * Ignored on older Claude models that use `thinking: disabled`.
   */
  reasoningEffort?: string | null;
  /**
   * Sampling temperature 0–1. On Haiku/Sonnet/Opus 5.5 the API rejects
   * any value other than default — those models omit this field (see
   * `claudeAllowsCustomTemperature`). Use `thinkingMode: "disabled"` there
   * for a “cooler”, more instruction-bound author rewrite.
   */
  temperature?: number | null;
  /**
   * Override thinking config. Default: adaptive (Haiku/Opus 5.5),
   * between_tools (Sonnet 5.5), disabled (older).
   */
  thinkingMode?: "adaptive" | "disabled" | "between_tools" | "auto" | null;
};

/** Claude 5.5 family: custom temperature / top_p / top_k → API 400. */
export function claudeAllowsCustomTemperature(modelSlug: string): boolean {
  return !(
    isClaudeHaiku55Slug(modelSlug) ||
    isClaudeSonnet55Slug(modelSlug) ||
    isClaudeOpus55Slug(modelSlug)
  );
}

export type ClaudeGenerateResult = {
  text: string;
  modelSlug: string;
  /** Anthropic `stop_reason` — e.g. end_turn | max_tokens. */
  stopReason?: string;
};

/** Resolve `CLAUDE_API_KEY` (also used by Message Batches). */
export function getClaudeApiKey(): string {
  const key = process.env.CLAUDE_API_KEY?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (!key) {
    throw new Error(
      "CLAUDE_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  // Anthropic keys are `sk-ant-…`; `sk-proj-…` is OpenAI and will always 401.
  if (key.startsWith("sk-proj-") || key.startsWith("sk-")) {
    if (!key.startsWith("sk-ant-")) {
      throw new Error(
        "CLAUDE_API_KEY sieht nicht nach einem Anthropic-Key aus (erwartet „sk-ant-…“). Bitte den Key aus console.anthropic.com eintragen — nicht den OpenAI-Key.",
      );
    }
  }
  return key;
}

/**
 * Build Anthropic Messages body (sync + Message Batches `params`).
 * Does not call the network.
 */
export function buildClaudeMessagesParams(
  input: ClaudeGenerateInput,
): Record<string, unknown> {
  let userText = input.userText;
  if (input.jsonOutput) {
    userText = `${userText}\n\nAntworte ausschließlich mit gültigem JSON, ohne Markdown-Codeblöcke.`;
  }

  const cacheablePrefix = input.cacheablePrefix?.trim() ?? "";
  const systemInstruction = input.systemInstruction?.trim() ?? "";
  const sonnet55 = isClaudeSonnet55Slug(input.modelSlug);
  const opus55 = isClaudeOpus55Slug(input.modelSlug);
  const haiku55 = isClaudeHaiku55Slug(input.modelSlug);

  const maxTokens = Math.max(256, Math.round(input.maxTokens ?? 8192));
  const body: Record<string, unknown> = {
    model: input.modelSlug,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  };

  const effortRaw = (input.reasoningEffort ?? "medium").trim().toLowerCase();
  const allowedEffort = new Set(["low", "medium", "high"]);
  const effort = allowedEffort.has(effortRaw) ? effortRaw : "medium";

  const thinkingOverride = (input.thinkingMode ?? "auto").trim().toLowerCase();
  if (thinkingOverride === "disabled") {
    body.thinking = { type: "disabled" };
    if (opus55 || haiku55 || sonnet55) {
      body.output_config = { effort };
    }
  } else if (thinkingOverride === "adaptive") {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort };
  } else if (thinkingOverride === "between_tools") {
    body.thinking = { type: "between_tools" };
    body.output_config = { effort };
  } else if (opus55 || haiku55) {
    // Opus / Haiku 5.5: adaptive thinking + effort.
    body.thinking = { type: "adaptive" };
    body.output_config = { effort };
  } else if (sonnet55) {
    body.thinking = { type: "between_tools" };
    body.output_config = { effort };
  } else {
    body.thinking = { type: "disabled" };
  }

  if (
    input.temperature != null &&
    Number.isFinite(input.temperature) &&
    claudeAllowsCustomTemperature(input.modelSlug)
  ) {
    body.temperature = Math.min(1, Math.max(0, input.temperature));
  }

  const cacheTtl = input.cacheTtl === "1h" ? "1h" : undefined;

  // Prompt caching: put stable book prefix last in `system` with cache_control.
  if (cacheablePrefix.length >= 200) {
    const systemBlocks: Array<Record<string, unknown>> = [];
    if (systemInstruction) {
      systemBlocks.push({ type: "text", text: systemInstruction });
    }
    const cacheControl: Record<string, unknown> = { type: "ephemeral" };
    if (cacheTtl) cacheControl.ttl = cacheTtl;
    systemBlocks.push({
      type: "text",
      text: cacheablePrefix,
      cache_control: cacheControl,
    });
    body.system = systemBlocks;
  } else if (systemInstruction) {
    body.system = systemInstruction;
  }

  return body;
}

type ClaudeContentBlock = {
  type?: string;
  text?: string;
};

type ClaudeMessagesResponse = {
  content?: ClaudeContentBlock[];
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
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
      code === "UND_ERR_SOCKET"
    ) {
      return true;
    }
    return isRetryableNetworkError(cause);
  }
  return false;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
}

function networkErrorMessage(error: unknown): string {
  if (isRetryableNetworkError(error)) {
    return "Verbindung zu Claude abgebrochen (Netz/Timeout). Bitte Schritt erneut starten — Fortschritt bleibt erhalten.";
  }
  if (error instanceof Error) return error.message;
  return "Claude-Anfrage fehlgeschlagen.";
}

/**
 * Calls Anthropic `/v1/messages`.
 * Sonnet 5: `thinking: disabled`. Sonnet 5.5: `between_tools` + effort.
 * Opus / Haiku 5.5: `thinking: adaptive` + `output_config.effort`.
 */
export async function generateWithClaude(
  input: ClaudeGenerateInput,
): Promise<ClaudeGenerateResult> {
  const apiKey = getClaudeApiKey();
  let callInput: ClaudeGenerateInput = { ...input };
  let lastError: unknown;
  const budgetMs = Math.min(
    input.timeoutMs ?? AI_FETCH_TIMEOUT_MS,
    AI_FETCH_TIMEOUT_MAX_MS,
  );
  const deadline = Date.now() + budgetMs;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const body = buildClaudeMessagesParams(callInput);
    const maxTokens = Number(body.max_tokens) || 8192;
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[claude] model=${callInput.modelSlug} max_tokens=${maxTokens} attempt=${attempt}`,
      );
    }
    const bodyJson = JSON.stringify(body);

    const remaining = deadline - Date.now();
    if (remaining < MIN_RETRY_BUDGET_MS && attempt > 1) {
      throw mapAiFetchError(
        new DOMException("Timeout", "TimeoutError"),
        "Claude",
        budgetMs,
      );
    }
    if (remaining < 1_000) {
      throw mapAiFetchError(
        new DOMException("Timeout", "TimeoutError"),
        "Claude",
        budgetMs,
      );
    }

    try {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: bodyJson,
        signal: aiFetchSignal(remaining),
      });

      if (
        !response.ok &&
        isRetryableHttpStatus(response.status) &&
        attempt < MAX_ATTEMPTS &&
        deadline - Date.now() > MIN_RETRY_BUDGET_MS
      ) {
        const wait = Math.min(RETRY_BASE_MS * attempt, deadline - Date.now() - MIN_RETRY_BUDGET_MS);
        console.warn(
          `[claude] HTTP ${response.status}, retry ${attempt}/${MAX_ATTEMPTS} in ${wait}ms`,
        );
        await sleep(Math.max(0, wait));
        continue;
      }

      const payload = (await response.json()) as ClaudeMessagesResponse;

      if (!response.ok || payload.error) {
        throw new Error(
          payload.error?.message ??
            `Claude-Anfrage fehlgeschlagen (${response.status}).`,
        );
      }

      const text =
        payload.content
          ?.filter((block) => block.type === "text" || Boolean(block.text))
          .map((block) => block.text ?? "")
          .join("")
          .trim() ?? "";

      if (!text) {
        const types = (payload.content ?? [])
          .map((b) => b.type || "unknown")
          .join(",");
        const stop = payload.stop_reason ?? "?";
        // Thinking can eat the whole max_tokens budget → empty text.
        if (
          attempt < MAX_ATTEMPTS &&
          deadline - Date.now() > MIN_RETRY_BUDGET_MS
        ) {
          console.warn(
            `[claude] empty text (stop=${stop}, blocks=${types || "none"}), retry with higher max_tokens`,
          );
          callInput = {
            ...callInput,
            maxTokens: Math.min(64_000, Math.max(maxTokens * 2, 32_768)),
            reasoningEffort: "low",
          };
          await sleep(Math.min(RETRY_BASE_MS * attempt, 2_000));
          continue;
        }
        throw new Error(
          `Claude hat keinen Text zurückgegeben (stop_reason=${stop}, blocks=${types || "none"}).`,
        );
      }

      const usage = payload.usage;
      if (usage) {
        recordAiUsage({
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
        });
      }

      return {
        text,
        modelSlug: input.modelSlug,
        stopReason: payload.stop_reason ?? undefined,
      };
    } catch (error) {
      lastError = error;
      // Timeouts / aborts: fail immediately (do not burn the whole budget on retries).
      if (isAiAbortError(error)) {
        throw mapAiFetchError(error, "Claude", budgetMs);
      }
      if (
        isRetryableNetworkError(error) &&
        attempt < MAX_ATTEMPTS &&
        deadline - Date.now() > MIN_RETRY_BUDGET_MS
      ) {
        const wait = Math.min(
          RETRY_BASE_MS * attempt,
          deadline - Date.now() - MIN_RETRY_BUDGET_MS,
        );
        console.warn(
          `[claude] network error, retry ${attempt}/${MAX_ATTEMPTS} in ${wait}ms:`,
          error instanceof Error ? error.message : error,
        );
        await sleep(Math.max(0, wait));
        continue;
      }
      break;
    }
  }

  throw new Error(networkErrorMessage(lastError));
}
