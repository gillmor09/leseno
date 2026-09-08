/**
 * ElevenLabs Text-to-Speech (`POST /v1/text-to-speech/{voice_id}`).
 * Latest model: `eleven_v3`; German via `language_code: de`.
 */

import {
  ELEVENLABS_TTS_LANGUAGE_CODE,
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
  getElevenLabsTtsVoiceId,
} from "@/lib/ai/elevenlabs";

export type ElevenLabsTtsInput = {
  text: string;
  /** Model id body field (`eleven_v3`, …). */
  modelSlug?: string;
  /** Optional voice id; defaults to Leseno ElevenLabs voice. */
  voiceId?: string | null;
};

export type ElevenLabsTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
};

/**
 * Synthesizes MP3 speech via ElevenLabs (default: Eleven v3 + German).
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

  const response = await fetch(
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelSlug,
        language_code: ELEVENLABS_TTS_LANGUAGE_CODE,
      }),
    },
  );

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        detail?:
          | string
          | { message?: string; status?: string }
          | Array<{ msg?: string; message?: string }>;
        message?: string;
      };
      if (typeof payload.message === "string") {
        detail = payload.message.trim();
      } else if (typeof payload.detail === "string") {
        detail = payload.detail.trim();
      } else if (
        payload.detail &&
        typeof payload.detail === "object" &&
        !Array.isArray(payload.detail) &&
        typeof payload.detail.message === "string"
      ) {
        detail = payload.detail.message.trim();
      } else if (Array.isArray(payload.detail)) {
        detail = payload.detail
          .map((item) => item.message ?? item.msg ?? "")
          .filter(Boolean)
          .join(" ")
          .trim();
      }
    } catch {
      detail = "";
    }
    throw new Error(
      detail || `ElevenLabs-TTS fehlgeschlagen (${response.status}).`,
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("ElevenLabs-TTS hat kein Audio zurückgegeben.");
  }

  return { audio, mimeType: "audio/mpeg", modelSlug };
}
