/**
 * Routes story TTS by `ai_models` provider / slug
 * (ElevenLabs, Inworld, Fish Audio, or OpenAI TTS).
 * On ElevenLabs quota exhaustion, falls back to OpenAI → Fish → Inworld when keys exist.
 */

import { synthesizeSpeechWithElevenLabs } from "@/lib/ai/elevenlabs-tts";
import { synthesizeSpeechWithFish } from "@/lib/ai/fish-tts";
import { synthesizeSpeechWithInworld } from "@/lib/ai/inworld-tts";
import { synthesizeSpeechWithOpenAi } from "@/lib/ai/openai-tts";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import { UserFacingError } from "@/lib/errors/user-facing";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";

export type SynthesizeSpeechResult = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  modelSlug: string;
  provider: string;
};

export type ResolvedTtsModelConfig = {
  provider: string;
  modelSlug: string;
  /** Provider voice id from `ai_models.tts_voice_id`, else null → env default. */
  voiceId: string | null;
};

/**
 * Resolves the active Vorlesen model from the prompt catalog (`tts-default`).
 */
export async function resolveTtsModelConfig(): Promise<ResolvedTtsModelConfig> {
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const row = catalog.models.find(
      (model) => model.id === "tts-default" && model.isActive,
    );
    if (row?.modelSlug) {
      const wired = findWiredAiEndpoint(row.modelSlug);
      return {
        provider: wired?.provider ?? row.provider,
        modelSlug: row.modelSlug,
        voiceId: row.ttsVoiceId?.trim() || null,
      };
    }
  } catch (error) {
    console.error("[resolveTtsModelConfig]", error);
  }

  return {
    provider: "elevenlabs",
    modelSlug: "eleven_v3",
    voiceId: null,
  };
}

function envKeyPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * Alternate TTS providers when ElevenLabs monthly credits are exhausted.
 * Voice IDs from the ElevenLabs catalog row do not apply — use each provider default.
 */
function elevenLabsQuotaFallbacks(): ResolvedTtsModelConfig[] {
  const out: ResolvedTtsModelConfig[] = [];
  if (envKeyPresent("OPENAI_API_KEY")) {
    out.push({
      provider: "openai-tts",
      modelSlug: "tts-1",
      voiceId: null,
    });
  }
  if (envKeyPresent("FISH_API_KEY")) {
    out.push({
      provider: "fish-audio",
      modelSlug: "s2.1-pro-free",
      voiceId: null,
    });
  }
  if (envKeyPresent("INWORLD_API_KEY")) {
    out.push({
      provider: "inworld",
      modelSlug: "inworld-tts-2-flash",
      voiceId: null,
    });
  }
  return out;
}

function isElevenLabsQuotaError(error: unknown): boolean {
  return (
    error instanceof UserFacingError &&
    error.message.toLowerCase().includes("elevenlabs-kontingent")
  );
}

async function synthesizeSpeechChunkOnce(input: {
  text: string;
  provider: string;
  modelSlug: string;
  voiceId: string | null;
}): Promise<SynthesizeSpeechResult> {
  const wired = findWiredAiEndpoint(input.modelSlug);
  const provider = wired?.provider ?? input.provider;
  const voiceId = input.voiceId?.trim() || null;

  if (provider === "elevenlabs") {
    const result = await synthesizeSpeechWithElevenLabs({
      text: input.text,
      modelSlug: input.modelSlug,
      voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "inworld") {
    const result = await synthesizeSpeechWithInworld({
      text: input.text,
      modelSlug: input.modelSlug,
      voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "fish-audio") {
    const result = await synthesizeSpeechWithFish({
      text: input.text,
      modelSlug: input.modelSlug,
      referenceId: voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "openai-tts") {
    const result = await synthesizeSpeechWithOpenAi({
      text: input.text,
      modelSlug: input.modelSlug,
      voice: voiceId ?? undefined,
    });
    return { ...result, provider };
  }

  throw new Error(`TTS-Provider „${provider}“ ist nicht angebunden.`);
}

/**
 * Synthesizes one text chunk with the configured TTS provider.
 * ElevenLabs quota → automatic fallback to another configured provider (same voice not kept).
 */
export async function synthesizeSpeechChunk(input: {
  text: string;
  provider?: string;
  modelSlug?: string;
  voiceId?: string | null;
  /** When true, do not attempt quota fallbacks (used by story-level fallback). */
  disableQuotaFallback?: boolean;
}): Promise<SynthesizeSpeechResult> {
  const resolved =
    input.provider && input.modelSlug
      ? {
          provider: input.provider,
          modelSlug: input.modelSlug,
          voiceId: input.voiceId ?? null,
        }
      : await resolveTtsModelConfig();

  try {
    return await synthesizeSpeechChunkOnce({
      text: input.text,
      provider: resolved.provider,
      modelSlug: resolved.modelSlug,
      voiceId: resolved.voiceId,
    });
  } catch (error) {
    if (
      input.disableQuotaFallback ||
      resolved.provider !== "elevenlabs" ||
      !isElevenLabsQuotaError(error)
    ) {
      throw error;
    }

    const fallbacks = elevenLabsQuotaFallbacks();
    for (const fallback of fallbacks) {
      try {
        console.warn(
          `[synthesizeSpeechChunk] ElevenLabs-Kontingent leer → Fallback ${fallback.provider}/${fallback.modelSlug}`,
        );
        return await synthesizeSpeechChunkOnce({
          text: input.text,
          provider: fallback.provider,
          modelSlug: fallback.modelSlug,
          voiceId: fallback.voiceId,
        });
      } catch (fallbackError) {
        console.error(
          `[synthesizeSpeechChunk] Fallback ${fallback.provider} fehlgeschlagen`,
          fallbackError,
        );
      }
    }

    throw error;
  }
}

/**
 * Picks a whole-story TTS config after ElevenLabs quota failure (re-chunk for new limits).
 */
export function resolveElevenLabsQuotaFallbackConfig(): ResolvedTtsModelConfig | null {
  return elevenLabsQuotaFallbacks()[0] ?? null;
}

export function isTtsQuotaUserFacingError(error: unknown): boolean {
  return isElevenLabsQuotaError(error);
}
