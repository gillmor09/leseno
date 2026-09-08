/**
 * ElevenLabs TTS credentials (`ELEVENLABS_API_KEY`) and default Leseno voice.
 */

import { UserFacingError } from "@/lib/errors/user-facing";

const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

/**
 * Premade multilingual voice (Sarah) — works on free API keys with Eleven v3.
 * Override with `ELEVENLABS_TTS_VOICE_ID`.
 */
export const ELEVENLABS_TTS_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

/** ISO 639-1; Eleven v3 supports `language_code` for German. */
export const ELEVENLABS_TTS_LANGUAGE_CODE = "de";

export function getElevenLabsApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
  if (!key) {
    throw new UserFacingError(
      "Vorlesen ist noch nicht eingerichtet (ELEVENLABS_API_KEY fehlt).",
    );
  }
  return key;
}

export function getElevenLabsBaseUrl(): string {
  const configured =
    process.env.ELEVENLABS_BASE_URL?.trim() || DEFAULT_ELEVENLABS_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/** Voice id for `POST /v1/text-to-speech/{voice_id}`. */
export function getElevenLabsTtsVoiceId(): string {
  const fromEnv = process.env.ELEVENLABS_TTS_VOICE_ID?.trim() ?? "";
  return fromEnv || ELEVENLABS_TTS_DEFAULT_VOICE_ID;
}
