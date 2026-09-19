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
import { recordAiUsage } from "@/lib/ai/usage";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** At most one retry — shared wall-clock budget must not multiply to minutes. */
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 1_500;
const MIN_RETRY_BUDGET_MS = 12_000;

export type ClaudeGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
  /** Cap output size (default 8192). Lower for feedback/summary. */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
};

export type ClaudeGenerateResult = {
  text: string;
  modelSlug: string;
  /** Anthropic `stop_reason` — e.g. end_turn | max_tokens. */
  stopReason?: string;
};

function getClaudeApiKey(): string {
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
 * Thinking is disabled for Leseno throughput/cost; Sonnet 5 still writes well without it.
 */
export async function generateWithClaude(
  input: ClaudeGenerateInput,
): Promise<ClaudeGenerateResult> {
  const apiKey = getClaudeApiKey();

  let userText = input.userText;
  if (input.jsonOutput) {
    userText = `${userText}\n\nAntworte ausschließlich mit gültigem JSON, ohne Markdown-Codeblöcke.`;
  }

  const body: Record<string, unknown> = {
    model: input.modelSlug,
    max_tokens: input.maxTokens ?? 8192,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  };

  if (input.systemInstruction?.trim()) {
    body.system = input.systemInstruction.trim();
  }

  const bodyJson = JSON.stringify(body);
  let lastError: unknown;
  const budgetMs = Math.min(
    input.timeoutMs ?? AI_FETCH_TIMEOUT_MS,
    AI_FETCH_TIMEOUT_MAX_MS,
  );
  const deadline = Date.now() + budgetMs;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
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
        throw new Error("Claude hat keinen Text zurückgegeben.");
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
