/**
 * Fish Audio API credentials (`FISH_API_KEY`) and default Leseno voice.
 */

import { UserFacingError } from "@/lib/errors/user-facing";

const DEFAULT_FISH_BASE_URL = "https://api.fish.audio";

/**
 * Default voice model for `s2.1-pro` / `s2.1-pro-free` (`reference_id`).
 * Override with `FISH_TTS_REFERENCE_ID` if needed.
 */
export const FISH_TTS_DEFAULT_REFERENCE_ID =
  "90042f762dbf49baa2e7776d011eee6b";

export function getFishApiKey(): string {
  const key = process.env.FISH_API_KEY?.trim() ?? "";
  if (!key) {
    throw new UserFacingError(
      "Vorlesen ist noch nicht eingerichtet (FISH_API_KEY fehlt).",
    );
  }
  return key;
}

export function getFishBaseUrl(): string {
  const configured =
    process.env.FISH_BASE_URL?.trim() || DEFAULT_FISH_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/**
 * Voice model id sent as `reference_id` for Fish TTS.
 * Env override, else Leseno default voice.
 */
export function getFishTtsReferenceId(): string {
  const fromEnv = process.env.FISH_TTS_REFERENCE_ID?.trim() ?? "";
  return fromEnv || FISH_TTS_DEFAULT_REFERENCE_ID;
}
