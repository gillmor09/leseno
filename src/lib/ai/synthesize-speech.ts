/**
 * Routes story TTS by `ai_models` provider / slug
 * (ElevenLabs, Inworld, Fish Audio, or OpenAI TTS).
 */

import { synthesizeSpeechWithElevenLabs } from "@/lib/ai/elevenlabs-tts";
import { synthesizeSpeechWithFish } from "@/lib/ai/fish-tts";
import { synthesizeSpeechWithInworld } from "@/lib/ai/inworld-tts";
import { synthesizeSpeechWithOpenAi } from "@/lib/ai/openai-tts";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
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

/**
 * Synthesizes one text chunk with the configured TTS provider.
 */
export async function synthesizeSpeechChunk(input: {
  text: string;
  provider?: string;
  modelSlug?: string;
  voiceId?: string | null;
}): Promise<SynthesizeSpeechResult> {
  const resolved =
    input.provider && input.modelSlug
      ? {
          provider: input.provider,
          modelSlug: input.modelSlug,
          voiceId: input.voiceId ?? null,
        }
      : await resolveTtsModelConfig();

  const wired = findWiredAiEndpoint(resolved.modelSlug);
  const provider = wired?.provider ?? resolved.provider;
  const voiceId = resolved.voiceId?.trim() || null;

  if (provider === "elevenlabs") {
    const result = await synthesizeSpeechWithElevenLabs({
      text: input.text,
      modelSlug: resolved.modelSlug,
      voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "inworld") {
    const result = await synthesizeSpeechWithInworld({
      text: input.text,
      modelSlug: resolved.modelSlug,
      voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "fish-audio") {
    const result = await synthesizeSpeechWithFish({
      text: input.text,
      modelSlug: resolved.modelSlug,
      referenceId: voiceId,
    });
    return { ...result, provider };
  }

  if (provider === "openai-tts") {
    const result = await synthesizeSpeechWithOpenAi({
      text: input.text,
      modelSlug: resolved.modelSlug,
      voice: voiceId ?? undefined,
    });
    return { ...result, provider };
  }

  throw new Error(`TTS-Provider „${provider}“ ist nicht angebunden.`);
}
