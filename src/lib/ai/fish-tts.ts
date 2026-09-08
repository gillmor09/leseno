/**
 * Fish Audio Text-to-Speech (`POST /v1/tts`).
 * Model via `model` header (`s2.1-pro-free` / `s2.1-pro`); voice via `reference_id`.
 */

import {
  getFishApiKey,
  getFishBaseUrl,
  getFishTtsReferenceId,
} from "@/lib/ai/fish-audio";

export type FishTtsInput = {
  text: string;
  /** Fish model id header (`s2.1-pro`, `s2.1-pro-free`, …). */
  modelSlug?: string;
  /** Optional voice model id; defaults to Leseno Fish voice. */
  referenceId?: string | null;
};

export type FishTtsResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
};

/**
 * Synthesizes MP3 speech via Fish Audio S2 family (always with a voice id).
 */
export async function synthesizeSpeechWithFish(
  input: FishTtsInput,
): Promise<FishTtsResult> {
  const apiKey = getFishApiKey();
  const baseUrl = getFishBaseUrl();
  const modelSlug = input.modelSlug?.trim() || "s2.1-pro-free";
  const text = input.text.trim();
  const referenceId =
    input.referenceId?.trim() || getFishTtsReferenceId();

  if (!text) {
    throw new Error("Kein Text zum Vorlesen.");
  }

  const body: Record<string, unknown> = {
    text,
    reference_id: referenceId,
    format: "mp3",
    // Smaller files / faster transfer; speech stays clear at 64 kbps.
    mp3_bitrate: 64,
    normalize: true,
    latency: "normal",
  };

  const response = await fetch(`${baseUrl}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: modelSlug,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        message?: string;
        reason?: string | null;
      };
      detail =
        payload.message?.trim() ||
        (typeof payload.reason === "string" ? payload.reason.trim() : "") ||
        "";
    } catch {
      detail = "";
    }
    throw new Error(
      detail || `Fish-Audio-TTS fehlgeschlagen (${response.status}).`,
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("Fish-Audio-TTS hat kein Audio zurückgegeben.");
  }

  return { audio, mimeType: "audio/mpeg", modelSlug };
}
