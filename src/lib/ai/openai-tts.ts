/**
 * OpenAI Text-to-Speech (`POST /v1/audio/speech`).
 * Returns MP3 bytes for story read-aloud.
 */

import {
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getOpenAiTtsModelSlug,
  getOpenAiTtsVoice,
} from "@/lib/ai/openai";

export type OpenAiTtsInput = {
  text: string;
  /** Override model slug (defaults to `OPENAI_TTS_MODEL` / tts-1). */
  modelSlug?: string;
  voice?: string;
  /** Optional OpenAI TTS speed (0.25–4). Story UI uses browser playbackRate instead. */
  speed?: number;
};

export type OpenAiTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
};

/**
 * Synthesizes speech for one text chunk (OpenAI limit ~4096 input chars).
 */
export async function synthesizeSpeechWithOpenAi(
  input: OpenAiTtsInput,
): Promise<OpenAiTtsResult> {
  const apiKey = getOpenAiApiKey();
  const baseUrl = getOpenAiBaseUrl();
  const modelSlug = input.modelSlug?.trim() || getOpenAiTtsModelSlug();
  const voice = input.voice?.trim() || getOpenAiTtsVoice();
  const text = input.text.trim();
  const speed =
    typeof input.speed === "number" && Number.isFinite(input.speed)
      ? Math.min(4, Math.max(0.25, input.speed))
      : 1;

  if (!text) {
    throw new Error("Kein Text zum Vorlesen.");
  }

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelSlug,
      input: text,
      voice,
      response_format: "mp3",
      speed,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      detail = payload.error?.message?.trim() ?? "";
    } catch {
      detail = "";
    }
    throw new Error(
      detail || `OpenAI-TTS fehlgeschlagen (${response.status}).`,
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("OpenAI-TTS hat kein Audio zurückgegeben.");
  }

  return { audio, mimeType: "audio/mpeg", modelSlug };
}
