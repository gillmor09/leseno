/**
 * OpenAI API credentials (TTS and future chat).
 * Key: `OPENAI_API_KEY` in `.env.local` / Coolify.
 */

import { UserFacingError } from "@/lib/errors/user-facing";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!key) {
    throw new UserFacingError(
      "Vorlesen ist noch nicht eingerichtet (OPENAI_API_KEY fehlt).",
    );
  }
  return key;
}

export function getOpenAiBaseUrl(): string {
  const configured =
    process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/** TTS model slug (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`). */
export function getOpenAiTtsModelSlug(): string {
  return process.env.OPENAI_TTS_MODEL?.trim() || "tts-1";
}

/** OpenAI TTS voice id (alloy, echo, fable, onyx, nova, shimmer, …). */
export function getOpenAiTtsVoice(): string {
  return process.env.OPENAI_TTS_VOICE?.trim() || "nova";
}
