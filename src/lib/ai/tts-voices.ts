/**
 * Lists selectable TTS voices per provider (prefer German where the API allows).
 * Used by Admin KI-Modelle + Roman Hörbuch casting; ElevenLabs falls back to a
 * larger curated catalog when the API key cannot list the full library.
 */

import { getElevenLabsApiKey, getElevenLabsBaseUrl } from "@/lib/ai/elevenlabs";
import { getFishApiKey, getFishBaseUrl } from "@/lib/ai/fish-audio";
import { getInworldApiKey, getInworldBaseUrl } from "@/lib/ai/inworld";
import { isTtsProvider } from "@/lib/ai/wired-models";

export type TtsVoiceOption = {
  id: string;
  label: string;
  description?: string;
  /** Public MP3 sample URL from ElevenLabs (no TTS credits). */
  previewUrl?: string | null;
  /**
   * Voice Library owner id — when set, the voice must be added to the account
   * before TTS (`POST /v1/voices/add/{public_owner_id}/{voice_id}`).
   */
  publicOwnerId?: string | null;
};

function voiceOption(
  id: string,
  label: string,
  description?: string,
  extra?: Pick<TtsVoiceOption, "previewUrl" | "publicOwnerId">,
): TtsVoiceOption {
  return {
    id,
    label,
    ...(description ? { description } : {}),
    ...(extra?.previewUrl ? { previewUrl: extra.previewUrl } : {}),
    ...(extra?.publicOwnerId ? { publicOwnerId: extra.publicOwnerId } : {}),
  };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

/** Avoid hanging the admin UI / Next navigation on slow ElevenLabs calls. */
const ELEVENLABS_FETCH_MS = 8_000;

async function fetchElevenLabs(
  url: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVENLABS_FETCH_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "xi-api-key": apiKey,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
 * Premade ElevenLabs voices (fallback when `/voices` listing fails).
 * IDs are stable public defaults; labels help Hörbuch casting.
 */
export const ELEVENLABS_CURATED_VOICE_OPTIONS: readonly TtsVoiceOption[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", description: "Weich, klar — gut für Vorlesen" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George", description: "Ruhig, männlich" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily", description: "Warm, weiblich" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Tief, männlich" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "Ruhig, weiblich" },
  { id: "29vD33N1KgOYuGyKXlh", label: "Drew", description: "Ausgewogen, männlich" },
  { id: "2EiwWnXFnvU5JabPnv8n", label: "Clyde", description: "Mittel, männlich" },
  { id: "5Q0t7uMcjKMHE9HpMOzG", label: "Paul", description: "Klar, männlich" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi", description: "Kräftig, weiblich" },
  { id: "CYw3kZ02Hsov3ewxNhy1", label: "Dave", description: "Britisch, männlich" },
  { id: "D38z5RcWu1voky8WS1ja", label: "Fin", description: "Irisch, männlich" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni", description: "Weich, männlich" },
  { id: "GBv7mTt0atIp3Br8iCZE", label: "Thomas", description: "Ruhig, männlich" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie", description: "Australisch, männlich" },
  { id: "LcfcDJNUP1GQjkzn1xUU", label: "Emily", description: "Ruhig, weiblich" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", description: "Emotional, weiblich" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum", description: "Heiser, männlich" },
  { id: "ODq5zmih8GrVes37Diz60", label: "Patrick", description: "Heiser, männlich" },
  { id: "SOYHLrjzK2X1ezoPC6cr", label: "Harry", description: "Ängstlich, männlich" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam", description: "Ausgewogen, männlich" },
  { id: "ThT5KcBeYPX3keUQqHPh", label: "Dorothy", description: "Angenehm, weiblich" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", description: "Tief, männlich" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold", description: "Kräftig, männlich" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte", description: "Schwedisch, weiblich" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda", description: "Warm, weiblich" },
  { id: "Yko7PKHZNXotIFUBG7I9", label: "Matthew", description: "Ruhig, männlich" },
  { id: "ZQe5CZNOzWyzPSCn5a3c", label: "James", description: "Australisch, männlich" },
  { id: "Zlb1dXrM653NNiAsHTl4", label: "Joseph", description: "Britisch, männlich" },
  { id: "bVMeCyTHy58xNoL34h3p", label: "Jeremy", description: "Aufgeregt, männlich" },
  { id: "flq6f7yk4E4fJM5XTYuZ", label: "Michael", description: "Älter, männlich" },
  { id: "g5CIjZEefAph4nQFvHAz", label: "Ethan", description: "Sanft, männlich" },
  { id: "iP95p4xoKVk53GoZ742B", label: "Chris", description: "Unbeschwert, männlich" },
  { id: "jBpfuIE2acCO8z3wKNLl", label: "Gigi", description: "Kindlich, weiblich" },
  { id: "jsCqWAovK2LkecY7zXl4", label: "Freya", description: "Überrascht, weiblich" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian", description: "Tief, männlich" },
  { id: "oWAxZDx7w5VEj9dCyTzz", label: "Grace", description: "Südafrikanisch, weiblich" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", description: "Britisch, männlich" },
  { id: "pMsXgVXv3BLzUgSXRplE", label: "Serena", description: "Angenehm, weiblich" },
  { id: "piTKgcLEGmPE4e6mEKli", label: "Nicole", description: "Flüsternd, weiblich" },
  { id: "pqHfZKP75CvOlQylNhV4", label: "Bill", description: "Documentary, männlich" },
  { id: "t0jbNlBVZ17f02VDIeMI", label: "Jessie", description: "Raspelig, männlich" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam", description: "Rau, männlich" },
  { id: "z9fAnlkd2qhbgADuC8Aa", label: "Glinda", description: "Hexe, weiblich" },
  { id: "zrHiDhphv9ZnVXBqCLjz", label: "Giovanni", description: "Italienisch, männlich" },
  { id: "zrHgLDtDlbCNmPwKVSZY", label: "Mimi", description: "Kindlich, weiblich" },
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

function mergeVoicePreferRicher(
  a: TtsVoiceOption,
  b: TtsVoiceOption,
): TtsVoiceOption {
  return {
    id: a.id,
    label: a.label || b.label,
    description: a.description || b.description,
    previewUrl: a.previewUrl || b.previewUrl || null,
    publicOwnerId: a.publicOwnerId || b.publicOwnerId || null,
  };
}

function mergeVoiceLists(...lists: TtsVoiceOption[][]): TtsVoiceOption[] {
  const map = new Map<string, TtsVoiceOption>();
  for (const list of lists) {
    for (const voice of list) {
      const id = voice.id.trim();
      if (!id) continue;
      const prev = map.get(id);
      map.set(id, prev ? mergeVoicePreferRicher(prev, voice) : voice);
    }
  }
  return sortVoices([...map.values()]);
}

type ElevenLabsVoiceRow = {
  voice_id?: string;
  name?: string;
  preview_url?: string | null;
  labels?: Record<string, string>;
  description?: string | null;
  category?: string | null;
};

function mapAccountVoice(voice: ElevenLabsVoiceRow): TtsVoiceOption | null {
  const id = voice.voice_id?.trim() ?? "";
  if (!id) return null;
  const accent = voice.labels?.accent?.trim();
  const language = voice.labels?.language?.trim();
  const gender = voice.labels?.gender?.trim();
  const bits = [gender, accent, language, voice.category?.trim()]
    .filter(Boolean)
    .join(", ");
  const description =
    bits || voice.description?.trim() || undefined;
  return voiceOption(id, voice.name?.trim() || id, description, {
    previewUrl: voice.preview_url?.trim() || null,
  });
}

async function listElevenLabsAccountVoices(
  apiKey: string,
  baseUrl: string,
): Promise<TtsVoiceOption[]> {
  // Prefer v2 (one page); fall back to legacy v1. Cap work so UI stays responsive.
  try {
    const v2 = await fetchElevenLabs(
      `${baseUrl}/v2/voices?page_size=100`,
      apiKey,
    );
    if (v2.ok) {
      const page = (await v2.json()) as { voices?: ElevenLabsVoiceRow[] };
      const all = (page.voices ?? [])
        .map(mapAccountVoice)
        .filter(notNull);
      if (all.length > 0) return uniqueById(all);
    }
  } catch (error) {
    console.warn("[listElevenLabsAccountVoices] v2", error);
  }

  try {
    const v1 = await fetchElevenLabs(`${baseUrl}/v1/voices`, apiKey);
    if (!v1.ok) return [];
    const payload = (await v1.json()) as { voices?: ElevenLabsVoiceRow[] };
    return uniqueById(
      (payload.voices ?? []).map(mapAccountVoice).filter(notNull),
    );
  } catch (error) {
    console.warn("[listElevenLabsAccountVoices] v1", error);
    return [];
  }
}

type SharedVoiceRow = {
  voice_id?: string;
  name?: string;
  preview_url?: string | null;
  public_owner_id?: string | null;
  accent?: string | null;
  gender?: string | null;
  age?: string | null;
  language?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
  description?: string | null;
  category?: string | null;
};

async function listElevenLabsSharedVoices(
  apiKey: string,
  baseUrl: string,
  language: string,
  pageSize = 40,
): Promise<TtsVoiceOption[]> {
  const params = new URLSearchParams({
    page_size: String(pageSize),
    language,
  });
  try {
    const response = await fetchElevenLabs(
      `${baseUrl}/v1/shared-voices?${params}`,
      apiKey,
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { voices?: SharedVoiceRow[] };
    return (payload.voices ?? [])
      .map((voice) => {
        const id = voice.voice_id?.trim() ?? "";
        if (!id) return null;
        const bits = [
          voice.gender?.trim(),
          voice.age?.trim(),
          voice.accent?.trim(),
          voice.language?.trim(),
          voice.use_case?.trim(),
          voice.descriptive?.trim(),
        ]
          .filter(Boolean)
          .join(", ");
        return voiceOption(
          id,
          voice.name?.trim() || id,
          bits || voice.description?.trim() || undefined,
          {
            previewUrl: voice.preview_url?.trim() || null,
            publicOwnerId: voice.public_owner_id?.trim() || null,
          },
        );
      })
      .filter(notNull);
  } catch (error) {
    console.warn("[listElevenLabsSharedVoices]", language, error);
    return [];
  }
}

/**
 * Adds a Voice Library entry to the account so TTS/Dialogue can use it.
 * Idempotent: already-added voices are treated as success.
 */
export async function ensureElevenLabsSharedVoice(input: {
  voiceId: string;
  publicOwnerId: string;
}): Promise<void> {
  const apiKey = getElevenLabsApiKey();
  const baseUrl = getElevenLabsBaseUrl();
  const voiceId = input.voiceId.trim();
  const ownerId = input.publicOwnerId.trim();
  if (!voiceId || !ownerId) return;

  const url = `${baseUrl}/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (response.ok || response.status === 400 || response.status === 409) {
    // 400/409 often mean already in library.
    return;
  }
  const detail = await response.text().catch(() => "");
  throw new Error(
    detail.trim() ||
      `ElevenLabs-Stimme konnte nicht zur Bibliothek hinzugefügt werden (${response.status}).`,
  );
}

async function listElevenLabsVoices(): Promise<TtsVoiceOption[]> {
  try {
    const apiKey = getElevenLabsApiKey();
    const baseUrl = getElevenLabsBaseUrl();
    // Account first (fast path); shared library in parallel with a hard timeout.
    const accountPromise = listElevenLabsAccountVoices(apiKey, baseUrl);
    const sharedPromise = Promise.all([
      listElevenLabsSharedVoices(apiKey, baseUrl, "de", 40),
      listElevenLabsSharedVoices(apiKey, baseUrl, "en", 30),
    ]).catch(() => [[], []] as [TtsVoiceOption[], TtsVoiceOption[]]);

    const account = await accountPromise;
    const [sharedDe, sharedEn] = await sharedPromise;
    const merged = mergeVoiceLists(
      account,
      sharedDe,
      sharedEn,
      [...ELEVENLABS_CURATED_VOICE_OPTIONS],
    );
    if (merged.length > 0) return merged;
  } catch (error) {
    console.error("[listElevenLabsVoices]", error);
  }
  return sortVoices([...ELEVENLABS_CURATED_VOICE_OPTIONS]);
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
