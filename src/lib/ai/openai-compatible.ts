/**
 * OpenAI-compatible chat completions client for IONOS AI Model Hub.
 */

import { aiFetchSignal, mapAiFetchError } from "@/lib/ai/fetch-timeout";
import { getIonosApiToken, getIonosBaseUrl } from "@/lib/ai/ionos";
import { recordAiUsage } from "@/lib/ai/usage";

export type OpenAiCompatibleGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
  /** Cap completion length when the provider supports it. */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
};

export type OpenAiCompatibleGenerateResult = {
  text: string;
  modelSlug: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
};

/**
 * Calls `/v1/chat/completions` on the IONOS OpenAI-compatible endpoint.
 */
export async function generateWithOpenAiCompatible(
  input: OpenAiCompatibleGenerateInput,
): Promise<OpenAiCompatibleGenerateResult> {
  const apiKey = getIonosApiToken();
  const baseUrl = getIonosBaseUrl();
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

  if (input.maxTokens != null && input.maxTokens > 0) {
    body.max_tokens = Math.round(input.maxTokens);
  }

  if (input.jsonOutput) {
    body.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: aiFetchSignal(input.timeoutMs),
    });

    const payload = (await response.json()) as ChatCompletionResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ??
          `IONOS-Anfrage fehlgeschlagen (${response.status}).`,
      );
    }

    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new Error("IONOS hat keinen Text zurückgegeben.");
    }

    const usage = payload.usage;
    if (usage) {
      recordAiUsage({
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      });
    }

    return { text, modelSlug: input.modelSlug };
  } catch (error) {
    throw mapAiFetchError(error, "IONOS", input.timeoutMs);
  }
}
