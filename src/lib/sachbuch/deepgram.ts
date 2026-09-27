/**
 * Deepgram API key helpers. Prefer `DEEPGRAM_API_KEY`; accept typo alias `DEEPGAM_API_KEY`.
 */

export function getDeepgramApiKey(): string {
  const key =
    process.env.DEEPGRAM_API_KEY?.trim() ||
    process.env.DEEPGAM_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "DEEPGRAM_API_KEY fehlt. Bitte in .env.local setzen (Tippfehler-Alias DEEPGAM_API_KEY wird ebenfalls gelesen).",
    );
  }
  return key;
}

export function hasDeepgramApiKey(): boolean {
  return Boolean(
    process.env.DEEPGRAM_API_KEY?.trim() ||
      process.env.DEEPGAM_API_KEY?.trim(),
  );
}
