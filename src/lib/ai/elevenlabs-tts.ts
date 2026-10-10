/**
 * ElevenLabs speech synthesis.
 * - Classic TTS: `POST /v1/text-to-speech/{voice_id}` (v3, Flash, v4).
 * - Eleven v4: same TTS path with `language_code` + request stitching for long-form.
 * Default model: `eleven_v4` (90+ languages, Hörbuch-tauglich).
 */

import {
  ELEVENLABS_TTS_LANGUAGE_CODE,
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
  getElevenLabsTtsVoiceId,
} from "@/lib/ai/elevenlabs";
import { UserFacingError } from "@/lib/errors/user-facing";

/**
 * Compact CBR MP3 (half of mp3_44100_128).
 * Note: ElevenLabs has no `mp3_22050_64` — closest small formats are
 * `mp3_22050_32` or `mp3_44100_64`.
 */
export const ELEVENLABS_TTS_OUTPUT_FORMAT = "mp3_44100_64";

export type ElevenLabsTtsInput = {
  text: string;
  /** Model id body field (`eleven_v4`, `eleven_v3`, `eleven_flash_v2_5`, …). */
  modelSlug?: string;
  /** Optional voice id; defaults to Leseno ElevenLabs voice. */
  voiceId?: string | null;
  /**
   * ISO 639-1 language for the model + text normalization (v3/v4).
   * Defaults to {@link ELEVENLABS_TTS_LANGUAGE_CODE} (`de`).
   */
  languageCode?: string | null;
  /** Continuity: trailing text from the previous chunk (max ~100–200 chars). */
  previousText?: string | null;
  /** Continuity: prior ElevenLabs `request-id` values (max 3). */
  previousRequestIds?: string[] | null;
};

export type ElevenLabsTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
  /** ElevenLabs request id for stitching the next chunk. */
  requestId: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fail hung ElevenLabs calls instead of freezing the Hörbuch UI for minutes. */
const ELEVENLABS_TTS_TIMEOUT_MS = 90_000;

async function fetchElevenLabsAudio(
  url: string,
  apiKey: string,
  body: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVENLABS_TTS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new UserFacingError(
        "ElevenLabs braucht zu lange (Timeout 90 s). Bitte erneut versuchen oder kürzere Kapitel/Casting prüfen.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** True when ElevenLabs reports monthly / credit quota exhaustion. */
export function isElevenLabsQuotaMessage(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("credits remaining") ||
    lower.includes("credit_limit") ||
    lower.includes("exceeds your quota")
  );
}

function isElevenV4Family(modelSlug: string): boolean {
  return /^eleven_v4(_turbo)?$/i.test(modelSlug.trim());
}

function pickRequestId(response: Response): string | null {
  return (
    response.headers.get("request-id")?.trim() ||
    response.headers.get("x-request-id")?.trim() ||
    response.headers.get("elevenlabs-request-id")?.trim() ||
    null
  );
}

/**
 * Synthesizes MP3 speech via ElevenLabs (default: Eleven v4).
 * Retries on transient 429/503; quota exhaustion fails immediately (clear German copy).
 */
export async function synthesizeSpeechWithElevenLabs(
  input: ElevenLabsTtsInput,
): Promise<ElevenLabsTtsResult> {
  const apiKey = getElevenLabsApiKey();
  const baseUrl = getElevenLabsBaseUrl();
  const modelSlug = input.modelSlug?.trim() || "eleven_v4";
  const voiceId = input.voiceId?.trim() || getElevenLabsTtsVoiceId();
  const text = input.text.trim();
  const languageCode =
    input.languageCode?.trim().toLowerCase() ||
    ELEVENLABS_TTS_LANGUAGE_CODE;

  if (!text) {
    throw new Error("Kein Text zum Vorlesen.");
  }

  const previousText = (input.previousText ?? "").trim().slice(-100);
  const previousRequestIds = (input.previousRequestIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(-3);

  // v4 marketing/docs: TTS convert supports model_id eleven_v4 + language_code.
  // Keep a single path for all ElevenLabs speech models.
  const url = `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`;
  const bodyPayload: Record<string, unknown> = {
    text,
    model_id: modelSlug,
    language_code: languageCode,
  };
  if (previousRequestIds.length > 0) {
    bodyPayload.previous_request_ids = previousRequestIds;
  } else if (previousText) {
    bodyPayload.previous_text = previousText;
  }
  // v4 audiobook: keep normalization on for numbers / dates.
  if (isElevenV4Family(modelSlug)) {
    bodyPayload.apply_text_normalization = "auto";
  }

  const body = JSON.stringify(bodyPayload);

  let response: Response | null = null;
  let lastDetail = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetchElevenLabsAudio(url, apiKey, body);

    if (response.ok) break;

    lastDetail = await readElevenLabsErrorDetail(response);
    if (isElevenLabsQuotaMessage(lastDetail)) {
      throw new UserFacingError(
        "Das ElevenLabs-Kontingent ist aufgebraucht. Bitte warte auf die monatliche Auffüllung, wähle unter Admin → KI-Modelle einen anderen Vorlese-Anbieter (z. B. OpenAI oder Fish Audio), oder erhöhe das ElevenLabs-Limit.",
      );
    }
    const retryable =
      (response.status === 429 || response.status === 503) &&
      !isElevenLabsQuotaMessage(lastDetail);
    if (!retryable || attempt === 4) {
      throw new Error(
        lastDetail || `ElevenLabs-TTS fehlgeschlagen (${response.status}).`,
      );
    }
    await sleep(700 * 2 ** attempt);
  }

  if (!response?.ok) {
    throw new Error(lastDetail || "ElevenLabs-TTS fehlgeschlagen.");
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("ElevenLabs-TTS hat kein Audio zurückgegeben.");
  }

  return {
    audio,
    mimeType: "audio/mpeg",
    modelSlug,
    requestId: pickRequestId(response),
  };
}

async function readElevenLabsErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?:
        | string
        | { message?: string; status?: string }
        | Array<{ msg?: string; message?: string }>;
      message?: string;
    };
    if (typeof payload.message === "string") {
      return payload.message.trim();
    }
    if (typeof payload.detail === "string") {
      return payload.detail.trim();
    }
    if (
      payload.detail &&
      typeof payload.detail === "object" &&
      !Array.isArray(payload.detail) &&
      typeof payload.detail.message === "string"
    ) {
      return payload.detail.message.trim();
    }
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map((item) => item.message ?? item.msg ?? "")
        .filter(Boolean)
        .join(" ")
        .trim();
    }
  } catch {
    return "";
  }
  return "";
}
