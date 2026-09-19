/**
 * Thin Gemini REST client for generateContent.
 * Uses `GEMINI_API_KEY` and the model slug from `leseno.ai_models`.
 */

import { aiFetchSignal, mapAiFetchError } from "@/lib/ai/fetch-timeout";
import { recordAiUsage } from "@/lib/ai/usage";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/**
 * Admin book pipeline often discusses conflict, trauma, crime — Gemini’s
 * default thresholds block those as PROHIBITED_CONTENT / SAFETY.
 * Fiction authoring needs the lowest adjustable thresholds.
 */
const CREATIVE_WRITING_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
] as const;

export type GeminiGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
  /** Optional output cap (`maxOutputTokens`). */
  maxTokens?: number;
  /** Optional per-call wall-clock budget (ms). */
  timeoutMs?: number;
  /**
   * Enable Grounding with Google Search (`tools: [{ googleSearch: {} }]`).
   * Incompatible with `jsonOutput` — leave jsonOutput false and parse text.
   */
  googleSearch?: boolean;
  /**
   * Gemini 3.x `thinkingConfig.thinkingLevel` (minimal|low|medium|high).
   * From KI-Rolle `reasoning_effort` column (same UI as OpenAI effort).
   */
  thinkingLevel?: string | null;
};

export type GeminiGroundingSource = {
  title: string;
  uri: string;
};

export type GeminiGenerateResult = {
  text: string;
  modelSlug: string;
  /** Present when Google Search grounding contributed sources. */
  groundingSources?: GeminiGroundingSource[];
  /** HTML/CSS snippet for required Google Search suggestions (ToS). */
  searchSuggestionsHtml?: string;
  webSearchQueries?: string[];
};

/** Shared by text + image Gemini clients (`GEMINI_API_KEY`). */
export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return key;
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
    safetyRatings?: Array<{ category?: string; probability?: string }>;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
      searchEntryPoint?: {
        renderedContent?: string;
      };
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
    status?: string;
  };
};

function blockedContentMessage(reason: string, detail?: string): string {
  const base = `Gemini hat die Anfrage blockiert (${reason}${
    detail ? `: ${detail}` : ""
  }).`;
  if (
    reason === "PROHIBITED_CONTENT" ||
    reason === "SAFETY" ||
    reason.includes("SAFETY")
  ) {
    return `${base} Buchkonflikte/Figuren können die Filter auslösen. In KI-Rollen für diese Aufgabe ein anderes Modell wählen (z. B. Claude).`;
  }
  return base;
}

/**
 * Calls Gemini generateContent and returns concatenated text parts.
 * Optional thinkingLevel + googleSearch from KI-Rollen / callers.
 */
export async function generateWithGemini(
  input: GeminiGenerateInput,
): Promise<GeminiGenerateResult> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(input.modelSlug)}:generateContent`;

  const maxOutputTokens = Math.max(
    1_024,
    Math.min(65_536, input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens,
  };

  // JSON mime type is unreliable with googleSearch tools — parse text instead.
  if (input.jsonOutput && !input.googleSearch) {
    generationConfig.responseMimeType = "application/json";
  }

  const level = (input.thinkingLevel ?? "").trim().toLowerCase();
  // Gemini rejects OpenAI-only values like "none" / "xhigh".
  if (
    level &&
    (level === "minimal" ||
      level === "low" ||
      level === "medium" ||
      level === "high")
  ) {
    generationConfig.thinkingConfig = { thinkingLevel: level };
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.userText }],
      },
    ],
    generationConfig,
    safetySettings: [...CREATIVE_WRITING_SAFETY_SETTINGS],
  };

  if (input.googleSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  if (input.systemInstruction?.trim()) {
    body.systemInstruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: aiFetchSignal(input.timeoutMs),
    });

    const payload = (await response.json()) as GeminiResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ??
          `Gemini-Anfrage fehlgeschlagen (${response.status}).`,
      );
    }

    const block = payload.promptFeedback?.blockReason;
    if (block) {
      throw new Error(
        blockedContentMessage(block, payload.promptFeedback?.blockReasonMessage),
      );
    }

    const candidate = payload.candidates?.[0];
    const finish = candidate?.finishReason ?? "";
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
      throw new Error(blockedContentMessage(finish));
    }

    const text =
      candidate?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";

    const meta = payload.usageMetadata;
    if (meta) {
      recordAiUsage({
        inputTokens: meta.promptTokenCount ?? 0,
        outputTokens: meta.candidatesTokenCount ?? 0,
        reasoningTokens: meta.thoughtsTokenCount,
        cacheReadTokens: meta.cachedContentTokenCount,
      });
    }

    if (!text) {
      const thoughts = meta?.thoughtsTokenCount;
      const reason = finish || "unbekannt";
      const hint =
        reason === "MAX_TOKENS" && thoughts && thoughts > 0
          ? ` Thinking hat ${thoughts} Tokens verbraucht — Ausgabe leer.`
          : reason === "MAX_TOKENS"
            ? " Token-Limit erreicht, bevor sichtbarer Text kam."
            : "";
      throw new Error(
        `Gemini hat keinen Text zurückgegeben (finishReason: ${reason}).${hint}`,
      );
    }

    const gm = candidate?.groundingMetadata;
    const groundingSources =
      gm?.groundingChunks
        ?.map((c) => ({
          title: (c.web?.title ?? "").trim(),
          uri: (c.web?.uri ?? "").trim(),
        }))
        .filter((s) => s.uri.length > 0) ?? undefined;
    const searchSuggestionsHtml =
      gm?.searchEntryPoint?.renderedContent?.trim() || undefined;
    const webSearchQueries = gm?.webSearchQueries?.filter(Boolean);

    return {
      text,
      modelSlug: input.modelSlug,
      groundingSources:
        groundingSources && groundingSources.length > 0
          ? groundingSources
          : undefined,
      searchSuggestionsHtml,
      webSearchQueries:
        webSearchQueries && webSearchQueries.length > 0
          ? webSearchQueries
          : undefined,
    };
  } catch (error) {
    throw mapAiFetchError(error, "Gemini", input.timeoutMs);
  }
}
