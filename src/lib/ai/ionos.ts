/**
 * Shared IONOS OpenAI-compatible API credentials and base URL.
 * Used by chat completions and image generations.
 */

const DEFAULT_IONOS_BASE_URL =
  "https://openai.inference.de-txl.ionos.com/v1";

/** Bearer JWT from DCD (`IONOS_API_TOKEN`). */
export function getIonosApiToken(): string {
  const token = process.env.IONOS_API_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error(
      "IONOS_API_TOKEN fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return token;
}

/** OpenAI-compatible base URL without trailing slash. */
export function getIonosBaseUrl(): string {
  const configured =
    process.env.IONOS_OPENAI_BASE_URL?.trim() || DEFAULT_IONOS_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/**
 * Pixel model for story illustrations (Mistral only plans prompts).
 * Override with `IONOS_IMAGE_MODEL` if needed.
 */
export function getIonosImageModelSlug(): string {
  return (
    process.env.IONOS_IMAGE_MODEL?.trim() ||
    "black-forest-labs/FLUX.2-klein-4B"
  );
}
