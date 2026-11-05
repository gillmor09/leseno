/**
 * Gemini 3.8 Flash TTS via generateContent (AUDIO modality).
 * Unary responses return WAV (24 kHz mono 16-bit) as inlineData base64.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */

import {
  aiFetchSignal,
  isRetryableAiHttpStatus,
  isRetryableAiNetworkError,
  mapAiFetchError,
  resolveAiTimeoutMs,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { getGeminiApiKey } from "@/lib/ai/gemini";
import { recordAiUsage } from "@/lib/ai/usage";
import { UserFacingError } from "@/lib/errors/user-facing";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Soft cap per request — model input limit is 8192 tokens. */
export const GEMINI_TTS_MAX_CHARS = 3_600;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;

export type GeminiTtsResult = {
  /** Complete WAV bytes (RIFF header) or raw PCM depending on API. */
  audio: Buffer;
  mimeType: string;
  modelSlug: string;
  voiceId: string;
};

type GeminiInlinePart = {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
  text?: string;
};

/**
 * Synthesize one speech chunk with Gemini TTS.
 * Prefer `gemini-3.8-flash-tts` for audiobook narration.
 */
export async function synthesizeSpeechWithGeminiTts(input: {
  text: string;
  modelSlug?: string;
  voiceId?: string | null;
  /** Turn-level style for speech_metadata. */
  style?: string | null;
  timeoutMs?: number;
}): Promise<GeminiTtsResult> {
  const text = input.text.trim();
  if (!text) {
    throw new UserFacingError("Kein Text für die Vertonung.");
  }
  if (text.length > GEMINI_TTS_MAX_CHARS + 200) {
    throw new UserFacingError(
      `Text zu lang für einen TTS-Chunk (${text.length} Zeichen, max. ~${GEMINI_TTS_MAX_CHARS}).`,
    );
  }

  const modelSlug = (input.modelSlug ?? "gemini-3.8-flash-tts").trim();
  const voiceId = (input.voiceId ?? "Kore").trim() || "Kore";
  const style = (input.style ?? "").trim();
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(modelSlug)}:generateContent`;
  const budgetMs = resolveAiTimeoutMs(input.timeoutMs, 180_000);
  const deadline = Date.now() + budgetMs;

  const part: Record<string, unknown> = { text };
  if (style) {
    part.speechMetadata = { style };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [part],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          // Gemini 3.8 single-speaker: voice name / designed voice id.
          voice: voiceId,
        },
      },
    },
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) {
      throw mapAiFetchError(
        new DOMException("Timeout", "TimeoutError"),
        "Gemini TTS",
        budgetMs,
      );
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: aiFetchSignal(Math.max(1_000, remaining)),
      });

      if (
        !response.ok &&
        isRetryableAiHttpStatus(response.status) &&
        attempt < MAX_ATTEMPTS
      ) {
        await sleepMs(RETRY_BASE_MS * attempt);
        continue;
      }

      const payload = (await response.json()) as {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: GeminiInlinePart[] };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      if (!response.ok) {
        const msg =
          payload.error?.message?.trim() ||
          `Gemini TTS HTTP ${response.status}`;
        throw new UserFacingError(`Gemini TTS: ${msg}`);
      }

      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      let audio: Buffer | null = null;
      let mimeType = "audio/wav";
      for (const p of parts) {
        const inline = p.inlineData ?? p.inline_data;
        const data = inline?.data?.trim();
        if (!data) continue;
        audio = Buffer.from(data, "base64");
        mimeType =
          (inline as { mimeType?: string; mime_type?: string })?.mimeType?.trim() ||
          (inline as { mime_type?: string })?.mime_type?.trim() ||
          "audio/wav";
        break;
      }

      if (!audio || audio.byteLength < 100) {
        throw new UserFacingError(
          "Gemini TTS lieferte keine Audiodaten — Text kürzen oder erneut versuchen.",
        );
      }

      if (payload.usageMetadata) {
        recordAiUsage({
          inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
          outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
        });
      }

      return { audio, mimeType, modelSlug, voiceId };
    } catch (error) {
      lastError = error;
      if (
        error instanceof UserFacingError ||
        (!isRetryableAiNetworkError(error) && attempt >= MAX_ATTEMPTS)
      ) {
        throw error;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleepMs(RETRY_BASE_MS * attempt);
        continue;
      }
    }
  }

  throw mapAiFetchError(lastError, "Gemini TTS", budgetMs);
}
