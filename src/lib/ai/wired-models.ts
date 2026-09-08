/**
 * Endpoints actually wired in Leseno (`generateText`, `generateImage`, TTS).
 * Admin KI-Modelle picks from this list; provider is derived from the slug.
 */

export type WiredAiEndpoint = {
  /** Unique select value (= modelSlug). */
  modelSlug: string;
  provider:
    | "gemini"
    | "gemini-image"
    | "claude"
    | "openai-compatible"
    | "ionos-image"
    | "openai-tts"
    | "fish-audio"
    | "inworld"
    | "elevenlabs";
  /** Short German label for the dropdown. */
  label: string;
  /** Where this endpoint is used in the product. */
  usage: string;
};

/**
 * Only these model slugs may be saved in `leseno.ai_models`.
 * Add a row here when a new API route is implemented.
 */
export const WIRED_AI_ENDPOINTS: readonly WiredAiEndpoint[] = [
  {
    modelSlug: "gemini-3.8-flash",
    provider: "gemini",
    label: "Gemini 3.8 Flash",
    usage: "Text: Fakten, Geschichten, Social (Caption + Bildszene)",
  },
  {
    modelSlug: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite",
    usage: "Text: günstig/schnell (hohe Volumen)",
  },
  {
    modelSlug: "claude-sonnet-5",
    provider: "claude",
    label: "Claude Sonnet 5",
    usage: "Text: Geschichten / Fakten (Anthropic)",
  },
  {
    modelSlug: "gemini-3.1-flash-image",
    provider: "gemini-image",
    label: "Gemini 3.1 Flash Image (Nano Banana 2)",
    usage: "Bilder: schnell, Social / Illustrationen",
  },
  {
    modelSlug: "gemini-3-pro-image",
    provider: "gemini-image",
    label: "Gemini 3 Pro Image (Nano Banana Pro)",
    usage: "Bilder: höchste Qualität",
  },
  {
    modelSlug: "openai/gpt-oss-120b",
    provider: "openai-compatible",
    label: "GPT-OSS 120B (IONOS)",
    usage: "Fakt „Warum?“ / Vertiefung",
  },
  {
    modelSlug: "mistralai/Mistral-Small-24B-Instruct",
    provider: "openai-compatible",
    label: "Mistral Small 24B (IONOS)",
    usage: "Layout: Bilder in HTML einbetten",
  },
  {
    modelSlug: "black-forest-labs/FLUX.2-klein-4B",
    provider: "ionos-image",
    label: "FLUX.2 klein 4B (IONOS)",
    usage: "Bilder: Illustrationen / Social (IONOS)",
  },
  {
    modelSlug: "eleven_v3",
    provider: "elevenlabs",
    label: "ElevenLabs Eleven v3",
    usage: "Vorlesen (aktuellstes Modell, Deutsch)",
  },
  {
    modelSlug: "inworld-tts-2-flash",
    provider: "inworld",
    label: "Inworld TTS 2 Flash",
    usage: "Vorlesen",
  },
  {
    modelSlug: "s2.1-pro-free",
    provider: "fish-audio",
    label: "Fish Audio S2.1 Pro Free",
    usage: "Vorlesen (Test / Free)",
  },
  {
    modelSlug: "s2.1-pro",
    provider: "fish-audio",
    label: "Fish Audio S2.1 Pro",
    usage: "Vorlesen",
  },
  {
    modelSlug: "tts-1",
    provider: "openai-tts",
    label: "OpenAI TTS-1",
    usage: "Vorlesen",
  },
  {
    modelSlug: "tts-1-hd",
    provider: "openai-tts",
    label: "OpenAI TTS-1 HD",
    usage: "Vorlesen (höher)",
  },
] as const;

const bySlug = new Map(
  WIRED_AI_ENDPOINTS.map((endpoint) => [endpoint.modelSlug, endpoint]),
);

/** Looks up a wired endpoint by model slug. */
export function findWiredAiEndpoint(
  modelSlug: string,
): WiredAiEndpoint | undefined {
  return bySlug.get(modelSlug.trim());
}

/**
 * Derives provider from a known slug.
 * Returns null if the slug is not wired (must not be saved).
 */
export function providerForWiredSlug(modelSlug: string): string | null {
  return findWiredAiEndpoint(modelSlug)?.provider ?? null;
}

const TTS_PROVIDERS = new Set([
  "elevenlabs",
  "inworld",
  "fish-audio",
  "openai-tts",
]);

/** True when the wired provider is a Vorlesen / TTS endpoint. */
export function isTtsProvider(provider: string): boolean {
  return TTS_PROVIDERS.has(provider.trim());
}
