/**
 * Inworld Text-to-Speech (`POST /tts/v1/voice`).
 * Auth: `Authorization: Basic $INWORLD_API_KEY`.
 */

import {
  INWORLD_TTS_LANGUAGE,
  getInworldApiKey,
  getInworldBaseUrl,
  getInworldTtsVoiceId,
} from "@/lib/ai/inworld";

export type InworldTtsInput = {
  text: string;
  /** Model id body field (`inworld-tts-2-flash`, …). */
  modelSlug?: string;
  /** Optional voice id; defaults to Leseno Inworld voice. */
  voiceId?: string | null;
};

export type InworldTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
};

/**
 * Synthesizes MP3 speech via Inworld sync TTS.
 */
export async function synthesizeSpeechWithInworld(
  input: InworldTtsInput,
): Promise<InworldTtsResult> {
  const apiKey = getInworldApiKey();
  const baseUrl = getInworldBaseUrl();
  const modelSlug = input.modelSlug?.trim() || "inworld-tts-2-flash";
  const voiceId = input.voiceId?.trim() || getInworldTtsVoiceId();
  const text = input.text.trim();

  if (!text) {
    throw new Error("Kein Text zum Vorlesen.");
  }

  const response = await fetch(`${baseUrl}/tts/v1/voice`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: modelSlug,
      language: INWORLD_TTS_LANGUAGE,
      audioConfig: {
        audioEncoding: "MP3",
        sampleRateHertz: 24000,
        bitrate: 128000,
      },
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        message?: string;
        error?: string | { message?: string };
      };
      if (typeof payload.message === "string") {
        detail = payload.message.trim();
      } else if (typeof payload.error === "string") {
        detail = payload.error.trim();
      } else if (
        payload.error &&
        typeof payload.error === "object" &&
        typeof payload.error.message === "string"
      ) {
        detail = payload.error.message.trim();
      }
    } catch {
      detail = "";
    }
    throw new Error(
      detail || `Inworld-TTS fehlgeschlagen (${response.status}).`,
    );
  }

  const payload = (await response.json()) as {
    audioContent?: string;
  };
  const b64 = payload.audioContent?.trim() ?? "";
  if (!b64) {
    throw new Error("Inworld-TTS hat kein Audio zurückgegeben.");
  }

  const audio = Buffer.from(b64, "base64");
  if (audio.byteLength === 0) {
    throw new Error("Inworld-TTS hat leeres Audio zurückgegeben.");
  }

  return { audio, mimeType: "audio/mpeg", modelSlug };
}
