/**
 * ElevenLabs Text-to-Dialogue (multi-voice) for Hörbuch casting.
 * POST /v1/text-to-dialogue — model eleven_v4, language_code, request stitching.
 */

import {
  ELEVENLABS_TTS_LANGUAGE_CODE,
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
} from "@/lib/ai/elevenlabs";
import {
  ELEVENLABS_TTS_OUTPUT_FORMAT,
  isElevenLabsQuotaMessage,
} from "@/lib/ai/elevenlabs-tts";
import { UserFacingError } from "@/lib/errors/user-facing";

export type ElevenLabsDialogueInput = {
  text: string;
  voiceId: string;
};

export type ElevenLabsDialogueRequest = {
  inputs: ElevenLabsDialogueInput[];
  modelSlug?: string;
  languageCode?: string | null;
  previousText?: string | null;
  previousRequestIds?: string[] | null;
};

export type ElevenLabsDialogueResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
  requestId: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ELEVENLABS_DIALOGUE_TIMEOUT_MS = 90_000;

async function fetchElevenLabsDialogue(
  url: string,
  apiKey: string,
  body: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    ELEVENLABS_DIALOGUE_TIMEOUT_MS,
  );
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
        "ElevenLabs-Dialog braucht zu lange (Timeout 90 s). Bitte erneut versuchen.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function pickRequestId(response: Response): string | null {
  return (
    response.headers.get("request-id")?.trim() ||
    response.headers.get("x-request-id")?.trim() ||
    response.headers.get("elevenlabs-request-id")?.trim() ||
    null
  );
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

/**
 * Synthesizes multi-speaker MP3 via ElevenLabs Text-to-Dialogue.
 */
export async function synthesizeDialogueWithElevenLabs(
  input: ElevenLabsDialogueRequest,
): Promise<ElevenLabsDialogueResult> {
  const apiKey = getElevenLabsApiKey();
  const baseUrl = getElevenLabsBaseUrl();
  const modelSlug = input.modelSlug?.trim() || "eleven_v4";
  const languageCode =
    input.languageCode?.trim().toLowerCase() || ELEVENLABS_TTS_LANGUAGE_CODE;

  const inputs = input.inputs
    .map((row) => ({
      text: row.text.trim(),
      voice_id: row.voiceId.trim(),
    }))
    .filter((row) => row.text && row.voice_id);

  if (inputs.length === 0) {
    throw new Error("Kein Dialog-Text zum Vorlesen.");
  }

  const uniqueVoices = new Set(inputs.map((r) => r.voice_id));
  if (uniqueVoices.size > 10) {
    throw new UserFacingError(
      "ElevenLabs erlaubt höchstens 10 verschiedene Stimmen pro Dialog-Anfrage.",
    );
  }

  const previousText = (input.previousText ?? "").trim().slice(-100);
  const previousRequestIds = (input.previousRequestIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(-3);

  const url = `${baseUrl}/v1/text-to-dialogue?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`;
  const bodyPayload: Record<string, unknown> = {
    inputs,
    model_id: modelSlug,
    language_code: languageCode,
    apply_text_normalization: "auto",
  };
  if (previousRequestIds.length > 0) {
    bodyPayload.previous_request_ids = previousRequestIds;
  } else if (previousText) {
    bodyPayload.previous_text = previousText;
  }

  let response: Response | null = null;
  let lastDetail = "";

  const body = JSON.stringify(bodyPayload);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetchElevenLabsDialogue(url, apiKey, body);

    if (response.ok) break;

    lastDetail = await readElevenLabsErrorDetail(response);
    if (isElevenLabsQuotaMessage(lastDetail)) {
      throw new UserFacingError(
        "Das ElevenLabs-Kontingent ist aufgebraucht. Bitte warte auf die monatliche Auffüllung oder wähle unter Admin → KI-Modelle einen anderen Vorlese-Anbieter.",
      );
    }
    const retryable =
      (response.status === 429 || response.status === 503) &&
      !isElevenLabsQuotaMessage(lastDetail);
    if (!retryable || attempt === 4) {
      throw new Error(
        lastDetail ||
          `ElevenLabs-Dialog fehlgeschlagen (${response.status}).`,
      );
    }
    await sleep(700 * 2 ** attempt);
  }

  if (!response?.ok) {
    throw new Error(lastDetail || "ElevenLabs-Dialog fehlgeschlagen.");
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("ElevenLabs-Dialog hat kein Audio zurückgegeben.");
  }

  return {
    audio,
    mimeType: "audio/mpeg",
    modelSlug,
    requestId: pickRequestId(response),
  };
}
