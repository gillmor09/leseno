/**
 * OpenAI Chat Completions client (`OPENAI_API_KEY`).
 * Used for GPT-6 Astra, GPT-5.6 Luna, and other OpenAI text models — not IONOS.
 *
 * Reasoning models (gpt-5*, gpt-6*, o*) count reasoning tokens against
 * `max_completion_tokens`. A tight cap can yield empty `content` with
 * `finish_reason: "length"` — we add headroom and set `reasoning_effort`.
 */

import {
  aiFetchSignal,
  mapAiFetchError,
  resolveAiTimeoutMs,
} from "@/lib/ai/fetch-timeout";
import { getOpenAiApiKey, getOpenAiBaseUrl } from "@/lib/ai/openai";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import { recordAiUsage } from "@/lib/ai/usage";

export type OpenAiChatGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
  /** Optional output cap (`max_completion_tokens`). */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
  /**
   * OpenAI `reasoning_effort` override from KI-Rolle.
   * When omitted, a model-family default is used.
   */
  reasoningEffort?: string | null;
};

export type OpenAiChatGenerateResult = {
  text: string;
  modelSlug: string;
};

type ChatContentPart = {
  type?: string;
  text?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | ChatContentPart[] | null;
      refusal?: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

/** Models that spend completion budget on hidden reasoning tokens. */
function isOpenAiReasoningModel(modelSlug: string): boolean {
  const slug = modelSlug.trim().toLowerCase();
  return (
    slug.startsWith("gpt-5") ||
    slug.startsWith("gpt-6") ||
    slug.startsWith("o1") ||
    slug.startsWith("o3") ||
    slug.startsWith("o4")
  );
}

/**
 * Cap for chat completions. Reasoning models need headroom beyond the
 * caller's visible-output estimate.
 */
function resolveMaxCompletionTokens(
  modelSlug: string,
  maxTokens: number | undefined,
): number | undefined {
  if (maxTokens == null || maxTokens <= 0) {
    return isOpenAiReasoningModel(modelSlug) ? 32_768 : undefined;
  }
  if (isOpenAiReasoningModel(modelSlug)) {
    const withHeadroom = Math.max(maxTokens + 8_192, 16_384);
    return Math.min(128_000, withHeadroom);
  }
  return Math.min(128_000, Math.max(256, maxTokens));
}

function extractMessageText(
  content: string | ChatContentPart[] | null | undefined,
): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.text) return part.text;
      return "";
    })
    .join("")
    .trim();
}

/**
 * Calls OpenAI `/v1/chat/completions` (e.g. `gpt-6-astra`, `gpt-5.6-luna`).
 */
export async function generateWithOpenAiChat(
  input: OpenAiChatGenerateInput,
): Promise<OpenAiChatGenerateResult> {
  const apiKey = getOpenAiApiKey();
  const baseUrl = getOpenAiBaseUrl();
  const url = `${baseUrl}/chat/completions`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (input.systemInstruction?.trim()) {
    messages.push({
      role: "system",
      content: input.systemInstruction.trim(),
    });
  }
  messages.push({ role: "user", content: input.userText });

  const body: Record<string, unknown> = {
    model: input.modelSlug,
    messages,
  };

  const maxCompletionTokens = resolveMaxCompletionTokens(
    input.modelSlug,
    input.maxTokens,
  );
  if (maxCompletionTokens != null) {
    body.max_completion_tokens = maxCompletionTokens;
  }

  if (isOpenAiReasoningModel(input.modelSlug)) {
    const effort = resolveReasoningEffort(
      input.modelSlug,
      input.reasoningEffort,
    );
    if (effort) {
      body.reasoning_effort = effort;
    }
  }

  if (input.jsonOutput) {
    body.response_format = { type: "json_object" };
  }

  try {
    const timeoutMs = resolveAiTimeoutMs(input.timeoutMs);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: aiFetchSignal(timeoutMs),
    });

    const payload = (await response.json()) as ChatCompletionResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ??
          `OpenAI-Anfrage fehlgeschlagen (${response.status}).`,
      );
    }

    const choice = payload.choices?.[0];
    const message = choice?.message;
    const text = extractMessageText(message?.content);
    const usage = payload.usage;
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
    const completionTokens = usage?.completion_tokens ?? 0;
    const visibleOutput = Math.max(
      0,
      completionTokens - (reasoningTokens ?? 0),
    );
    if (usage) {
      recordAiUsage({
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: visibleOutput,
        reasoningTokens: reasoningTokens ?? undefined,
        cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
      });
    }
    if (!text) {
      const refusal = message?.refusal?.trim();
      if (refusal) {
        throw new Error(`OpenAI hat die Anfrage abgelehnt: ${refusal}`);
      }
      const finish = choice?.finish_reason ?? "unbekannt";
      const reasoningHint =
        finish === "length" || (reasoningTokens != null && reasoningTokens > 0)
          ? " Reasoning hat vermutlich das Token-Budget aufgebraucht — bitte erneut versuchen."
          : "";
      throw new Error(
        `OpenAI hat keinen Text zurückgegeben (finish_reason: ${finish}${
          reasoningTokens != null ? `, reasoning_tokens: ${reasoningTokens}` : ""
        }).${reasoningHint}`,
      );
    }

    return { text, modelSlug: input.modelSlug };
  } catch (error) {
    throw mapAiFetchError(
      error,
      "OpenAI",
      resolveAiTimeoutMs(input.timeoutMs),
    );
  }
}
