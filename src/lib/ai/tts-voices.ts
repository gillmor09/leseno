/**
 * Lists selectable TTS voices per provider (prefer German where the API allows).
 * Used by Admin KI-Modelle; OpenAI/ElevenLabs fall back to curated catalogs.
 */

import { getElevenLabsApiKey, getElevenLabsBaseUrl } from "@/lib/ai/elevenlabs";
import { getFishApiKey, getFishBaseUrl } from "@/lib/ai/fish-audio";
import { getInworldApiKey, getInworldBaseUrl } from "@/lib/ai/inworld";
import { isTtsProvider } from "@/lib/ai/wired-models";

export type TtsVoiceOption = {
  id: string;
  label: string;
  description?: string;
};

function voiceOption(
  id: string,
  label: string,
  description?: string,
): TtsVoiceOption {
  return description ? { id, label, description } : { id, label };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

/** Built-in OpenAI voices for `tts-1` / `tts-1-hd`. */
export const OPENAI_TTS_VOICE_OPTIONS: readonly TtsVoiceOption[] = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "nova", label: "Nova" },
  { id: "onyx", label: "Onyx" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
] as const;

/**
 * Premade ElevenLabs voices known to work with free API keys + `eleven_v3`.
 * Full library listing needs `voices_read` (often missing on restricted keys).
 */
export const ELEVENLABS_CURATED_VOICE_OPTIONS: readonly TtsVoiceOption[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Sarah",
    description: "Weich, klar — gut für Vorlesen",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    label: "George",
    description: "Ruhig, männlich",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    label: "Lily",
    description: "Warm, weiblich",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Adam",
    description: "Tief, männlich",
  },
] as const;

function sortVoices(voices: TtsVoiceOption[]): TtsVoiceOption[] {
  return [...voices].sort((a, b) =>
    a.label.localeCompare(b.label, "de", { sensitivity: "base" }),
  );
}

function uniqueById(voices: TtsVoiceOption[]): TtsVoiceOption[] {
  const seen = new Set<string>();
  const out: TtsVoiceOption[] = [];
  for (const voice of voices) {
    const id = voice.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...voice, id });
  }
  return out;
}

async function listElevenLabsVoices(): Promise<TtsVoiceOption[]> {
  try {
    const apiKey = getElevenLabsApiKey();
    const baseUrl = getElevenLabsBaseUrl();
    const response = await fetch(`${baseUrl}/v1/voices`, {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        voices?: Array<{
          voice_id?: string;
          name?: string;
          labels?: Record<string, string>;
        }>;
      };
      const fromApi = (payload.voices ?? [])
        .map((voice) => {
          const id = voice.voice_id?.trim() ?? "";
          if (!id) return null;
          const accent = voice.labels?.accent?.trim();
          const language = voice.labels?.language?.trim();
          const bits = [accent, language].filter(Boolean).join(", ");
          return voiceOption(id, voice.name?.trim() || id, bits || undefined);
        })
        .filter(notNull);
      if (fromApi.length > 0) {
        return sortVoices(uniqueById(fromApi));
      }
    }
  } catch {
    // Fall through to curated list when key/permission is limited.
  }
  return [...ELEVENLABS_CURATED_VOICE_OPTIONS];
}

async function listInworldVoices(): Promise<TtsVoiceOption[]> {
  const apiKey = getInworldApiKey();
  const baseUrl = getInworldBaseUrl();
  const filter = encodeURIComponent('lang_code = "de-DE"');
  const response = await fetch(
    `${baseUrl}/voices/v1/voices?pageSize=100&filter=${filter}`,
    {
      headers: { Authorization: `Basic ${apiKey}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Inworld-Stimmen konnten nicht geladen werden (${response.status}).`);
  }
  const payload = (await response.json()) as {
    voices?: Array<{
      voiceId?: string;
      name?: string;
      displayName?: string;
      description?: string;
    }>;
  };
  const voices = (payload.voices ?? [])
    .map((voice) => {
      const id = (voice.voiceId ?? voice.name ?? "").trim();
      if (!id) return null;
      return voiceOption(
        id,
        (voice.displayName ?? voice.name ?? id).trim(),
        voice.description?.trim() || undefined,
      );
    })
    .filter(notNull);
  return sortVoices(uniqueById(voices));
}

async function listFishVoices(): Promise<TtsVoiceOption[]> {
  const apiKey = getFishApiKey();
  const baseUrl = getFishBaseUrl();
  const [deRes, selfRes] = await Promise.all([
    fetch(
      `${baseUrl}/model?language=de&page_size=40&page_number=1&sort_by=task_count`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      },
    ),
    fetch(`${baseUrl}/model?self=true&page_size=40&page_number=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }),
  ]);

  if (!deRes.ok && !selfRes.ok) {
    throw new Error(
      `Fish-Audio-Stimmen konnten nicht geladen werden (${deRes.status}).`,
    );
  }

  type FishItem = {
    _id?: string;
    id?: string;
    title?: string;
    description?: string;
  };

  async function parseItems(response: Response): Promise<FishItem[]> {
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: FishItem[] };
    return payload.items ?? [];
  }

  const [deItems, selfItems] = await Promise.all([
    parseItems(deRes),
    parseItems(selfRes),
  ]);

  const voices = [...selfItems, ...deItems]
    .map((item) => {
      const id = (item._id ?? item.id ?? "").trim();
      if (!id) return null;
      return voiceOption(
        id,
        item.title?.trim() || id,
        item.description?.trim() || undefined,
      );
    })
    .filter(notNull);

  return sortVoices(uniqueById(voices));
}

/**
 * Returns voice options for a TTS provider (German-first where supported).
 */
export async function listTtsVoicesForProvider(
  provider: string,
): Promise<TtsVoiceOption[]> {
  if (!isTtsProvider(provider)) {
    return [];
  }

  switch (provider) {
    case "openai-tts":
      return [...OPENAI_TTS_VOICE_OPTIONS];
    case "elevenlabs":
      return listElevenLabsVoices();
    case "inworld":
      return listInworldVoices();
    case "fish-audio":
      return listFishVoices();
    default:
      return [];
  }
}
