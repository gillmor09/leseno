/**
 * ElevenLabs Text-to-Speech (`POST /v1/text-to-speech/{voice_id}`).
 * Models: `eleven_v3`, `eleven_flash_v2_5`, …; German via `language_code: de`.
 * Uses compact MP3 (`mp3_44100_64`) for smaller files and faster transfer.
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
  /** Model id body field (`eleven_v3`, `eleven_flash_v2_5`, …). */
  modelSlug?: string;
  /** Optional voice id; defaults to Leseno ElevenLabs voice. */
  voiceId?: string | null;
};

export type ElevenLabsTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Synthesizes MP3 speech via ElevenLabs (default: Eleven v3 + German).
 * Retries on transient 429/503; quota exhaustion fails immediately (clear German copy).
 */
export async function synthesizeSpeechWithElevenLabs(
  input: ElevenLabsTtsInput,
): Promise<ElevenLabsTtsResult> {
  const apiKey = getElevenLabsApiKey();
  const baseUrl = getElevenLabsBaseUrl();
  const modelSlug = input.modelSlug?.trim() || "eleven_v3";
  const voiceId = input.voiceId?.trim() || getElevenLabsTtsVoiceId();
  const text = input.text.trim();

  if (!text) {
    throw new Error("Kein Text zum Vorlesen.");
  }

  const url = `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`;
  const body = JSON.stringify({
    text,
    model_id: modelSlug,
    language_code: ELEVENLABS_TTS_LANGUAGE_CODE,
  });

  let response: Response | null = null;
  let lastDetail = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body,
    });

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

  return { audio, mimeType: "audio/mpeg", modelSlug };
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
