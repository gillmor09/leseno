/**
 * Inworld TTS credentials (`INWORLD_API_KEY`).
 */

import { UserFacingError } from "@/lib/errors/user-facing";

const DEFAULT_INWORLD_BASE_URL = "https://api.inworld.ai";

/** Default stock voice; override with `INWORLD_TTS_VOICE_ID`. */
export const INWORLD_TTS_DEFAULT_VOICE_ID = "Ashley";

/** BCP-47 tag for Inworld `language` (German storytelling). */
export const INWORLD_TTS_LANGUAGE = "de-DE";

export function getInworldApiKey(): string {
  const key = process.env.INWORLD_API_KEY?.trim() ?? "";
  if (!key) {
    throw new UserFacingError(
      "Vorlesen ist noch nicht eingerichtet (INWORLD_API_KEY fehlt).",
    );
  }
  return key;
}

export function getInworldBaseUrl(): string {
  const configured =
    process.env.INWORLD_BASE_URL?.trim() || DEFAULT_INWORLD_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/** Voice id for Inworld TTS (`voiceId`). */
export function getInworldTtsVoiceId(): string {
  const fromEnv = process.env.INWORLD_TTS_VOICE_ID?.trim() ?? "";
  return fromEnv || INWORLD_TTS_DEFAULT_VOICE_ID;
}
