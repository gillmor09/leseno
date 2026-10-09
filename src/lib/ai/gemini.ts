/**
 * Thin Gemini REST client for generateContent.
 * Uses `GEMINI_API_KEY` and the model slug from `leseno.ai_models`.
 */

import { resolveGeminiCachedContent } from "@/lib/ai/gemini-cache";
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
  /**
   * Stable book bible. When long enough, stored via Gemini `cachedContents`
   * and referenced as `cachedContent` so batches reuse tokens.
   */
  cacheablePrefix?: string;
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

function visibleTextFromParts(parts: GeminiPart[] | undefined): string {
  return (
    parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function emptyResponseHint(
  finish: string,
  thoughts: number | undefined,
): string {
  const reason = finish || "unbekannt";
  if (thoughts && thoughts > 0) {
    return ` Thinking hat ${thoughts} Tokens verbraucht — sichtbare Ausgabe leer (finishReason: ${reason}).`;
  }
  if (reason === "MAX_TOKENS") {
    return " Token-Limit erreicht, bevor sichtbarer Text kam.";
  }
  if (reason === "STOP") {
    return " Antwort kam leer zurück (oft flüchtiger Flash-/Thinking-Glitch).";
  }
  return "";
}

/**
 * Calls Gemini generateContent and returns concatenated text parts.
 * Optional thinkingLevel + googleSearch from KI-Rollen / callers.
 * Retries once on empty STOP/MAX_TOKENS (Flash sometimes returns no visible parts).
 */
export async function generateWithGemini(
  input: GeminiGenerateInput,
): Promise<GeminiGenerateResult> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(input.modelSlug)}:generateContent`;

  const baseMaxOutputTokens = Math.max(
    1_024,
    Math.min(65_536, input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );

  const cacheablePrefix = input.cacheablePrefix?.trim() ?? "";
  const systemInstruction = input.systemInstruction?.trim() ?? "";

  // Explicit Context Cache when prefix is large enough; else inline fallback.
  let cachedContentName: string | null = null;
  if (cacheablePrefix.length >= 200 && !input.googleSearch) {
    cachedContentName = await resolveGeminiCachedContent({
      modelSlug: input.modelSlug,
      systemInstruction,
      cacheablePrefix,
    });
  }

  const level = (input.thinkingLevel ?? "").trim().toLowerCase();
  const thinkingOk =
    level === "minimal" ||
    level === "low" ||
    level === "medium" ||
    level === "high";

  try {
    let lastFinish = "";
    let lastThoughts: number | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generationConfig: Record<string, unknown> = {
        // Second try: a bit more room — thinking can eat the first budget.
        maxOutputTokens: Math.min(
          65_536,
          baseMaxOutputTokens + (attempt > 0 ? 2_048 : 0),
        ),
      };

      if (input.jsonOutput && !input.googleSearch) {
        generationConfig.responseMimeType = "application/json";
      }

      // Retry without thinking when the first pass returned only thought tokens.
      if (thinkingOk && attempt === 0) {
        generationConfig.thinkingConfig = { thinkingLevel: level };
      } else if (thinkingOk && attempt > 0 && level !== "low") {
        generationConfig.thinkingConfig = { thinkingLevel: "low" };
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

      if (cachedContentName) {
        body.cachedContent = cachedContentName;
      } else {
        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }
        if (cacheablePrefix) {
          body.contents = [
            {
              role: "user",
              parts: [{ text: `${cacheablePrefix}\n\n${input.userText}` }],
            },
          ];
        }
      }

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
          blockedContentMessage(
            block,
            payload.promptFeedback?.blockReasonMessage,
          ),
        );
      }

      const candidate = payload.candidates?.[0];
      const finish = candidate?.finishReason ?? "";
      lastFinish = finish;
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
        throw new Error(blockedContentMessage(finish));
      }

      const text = visibleTextFromParts(candidate?.content?.parts);

      const meta = payload.usageMetadata;
      lastThoughts = meta?.thoughtsTokenCount;
      if (meta) {
        recordAiUsage({
          inputTokens: meta.promptTokenCount ?? 0,
          outputTokens: meta.candidatesTokenCount ?? 0,
          reasoningTokens: meta.thoughtsTokenCount,
          cacheReadTokens: meta.cachedContentTokenCount,
        });
      }

      if (text) {
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
      }

      // Empty visible text — retry once (common Flash STOP / thinking glitch).
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
    }

    throw new Error(
      `Gemini hat keinen Text zurückgegeben (finishReason: ${
        lastFinish || "unbekannt"
      }).${emptyResponseHint(lastFinish, lastThoughts)}`,
    );
  } catch (error) {
    throw mapAiFetchError(error, "Gemini", input.timeoutMs);
  }
}
