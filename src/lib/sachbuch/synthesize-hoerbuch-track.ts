/**
 * Synthesize one Sachbuch Hörbuch track with Gemini TTS or ElevenLabs v4 Turbo
 * → Tolino MP3 → Storage.
 */

import {
  ELEVENLABS_TTS_LANGUAGE_CODE,
} from "@/lib/ai/elevenlabs";
import { synthesizeSpeechWithElevenLabs } from "@/lib/ai/elevenlabs-tts";
import {
  GEMINI_TTS_MAX_CHARS,
  synthesizeSpeechWithGeminiTts,
} from "@/lib/ai/gemini-tts";
import { mergeMp3Buffers } from "@/lib/ai/tts-mp3";
import {
  encodeAudioForTolino,
  ELEVENLABS_HOERBUCH_OUTPUT_FORMAT,
  probeMp3DurationSec,
  trimMp3ToDurationSec,
} from "@/lib/ai/tts-tolino-mp3";
import { UserFacingError } from "@/lib/errors/user-facing";
import {
  buildSachbuchHoerbuchIntroText,
  buildSachbuchHoerbuchSampleText,
  buildSachbuchHoerbuchTracks,
  findHoerbuchTrack,
  isSachbuchHoerbuchTtsProvider,
  resolveHoerbuchTrackSpokenText,
  SACHBUCH_HOERBUCH_DEFAULT_PROVIDER,
  SACHBUCH_HOERBUCH_DEFAULT_STYLE,
  SACHBUCH_HOERBUCH_DEFAULT_VOICE,
  SACHBUCH_HOERBUCH_ELEVENLABS_DEFAULT_VOICE,
  SACHBUCH_HOERBUCH_ELEVENLABS_MODEL_SLUG,
  SACHBUCH_HOERBUCH_INTRO_KAPITEL_ID,
  SACHBUCH_HOERBUCH_MODEL_SLUG,
  SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC,
  SACHBUCH_HOERBUCH_SAMPLE_MIN_SEC,
  SACHBUCH_HOERBUCH_SAMPLE_SAFE_MAX_SEC,
  SACHBUCH_HOERBUCH_SAMPLE_TARGET_SEC,
  sachbuchHoerbuchDefaultVoiceForProvider,
  sachbuchHoerbuchSampleFileName,
  sachbuchSpokenPlainText,
  toPersistedHoerbuchTracks,
} from "@/lib/sachbuch/hoerbuch";
import {
  createSachbuchHoerbuchSignedUrl,
  downloadSachbuchHoerbuchAudio,
  uploadSachbuchHoerbuchAudio,
} from "@/lib/sachbuch/hoerbuch-storage";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type { SachbuchHoerbuchTtsProvider } from "@/lib/sachbuch/types";
import {
  chunkTextForTts,
  MAX_TTS_CHARS_ELEVENLABS_HOERBUCH,
  ttsChunkMaxCharsForModel,
} from "@/lib/stories/plain-text-from-html";
import type {
  SachbuchHoerbuchSample,
  SachbuchHoerbuchTrackAudio,
} from "@/lib/sachbuch/types";

function resolveProvider(
  raw: string | undefined | null,
): SachbuchHoerbuchTtsProvider {
  const value = (raw ?? "").trim();
  return isSachbuchHoerbuchTtsProvider(value)
    ? value
    : SACHBUCH_HOERBUCH_DEFAULT_PROVIDER;
}

async function synthesizePlainToTolinoMp3(input: {
  text: string;
  provider: SachbuchHoerbuchTtsProvider;
  voiceId: string;
  style: string;
}): Promise<{ mp3: Buffer; modelSlug: string; voiceId: string }> {
  const spoken = sachbuchSpokenPlainText(input.text);
  if (spoken.length < 20) {
    throw new UserFacingError("Abschnittstext zu kurz für die Vertonung.");
  }

  if (input.provider === "elevenlabs") {
    const modelSlug = SACHBUCH_HOERBUCH_ELEVENLABS_MODEL_SLUG;
    const maxChars = Math.min(
      MAX_TTS_CHARS_ELEVENLABS_HOERBUCH,
      ttsChunkMaxCharsForModel("elevenlabs", modelSlug),
    );
    const chunks = chunkTextForTts(spoken, maxChars);
    const mp3Parts: Buffer[] = [];
    let voiceId =
      input.voiceId.trim() || SACHBUCH_HOERBUCH_ELEVENLABS_DEFAULT_VOICE;
    let previousRequestIds: string[] = [];
    let previousText = "";

    for (const chunk of chunks) {
      const raw = await synthesizeSpeechWithElevenLabs({
        text: chunk,
        modelSlug,
        voiceId,
        languageCode: ELEVENLABS_TTS_LANGUAGE_CODE,
        previousText: previousRequestIds.length ? null : previousText || null,
        previousRequestIds:
          previousRequestIds.length > 0 ? previousRequestIds : null,
        outputFormat: ELEVENLABS_HOERBUCH_OUTPUT_FORMAT,
      });
      mp3Parts.push(await encodeAudioForTolino(raw.audio, "in.mp3"));
      if (raw.requestId) {
        previousRequestIds = [...previousRequestIds, raw.requestId].slice(-3);
      }
      previousText = chunk.slice(-100);
    }

    const mp3 =
      mp3Parts.length === 1
        ? mp3Parts[0]!
        : await encodeAudioForTolino(await mergeMp3Buffers(mp3Parts), "in.mp3");
    return { mp3, modelSlug, voiceId };
  }

  const chunks = chunkTextForTts(spoken, GEMINI_TTS_MAX_CHARS);
  const mp3Parts: Buffer[] = [];
  let modelSlug = SACHBUCH_HOERBUCH_MODEL_SLUG;
  let voiceId = input.voiceId || SACHBUCH_HOERBUCH_DEFAULT_VOICE;

  for (const chunk of chunks) {
    const raw = await synthesizeSpeechWithGeminiTts({
      text: chunk,
      modelSlug: SACHBUCH_HOERBUCH_MODEL_SLUG,
      voiceId,
      style: input.style,
      timeoutMs: 240_000,
    });
    modelSlug = raw.modelSlug;
    voiceId = raw.voiceId;
    const ext =
      raw.mimeType.includes("mpeg") || raw.mimeType.includes("mp3")
        ? "in.mp3"
        : "in.wav";
    mp3Parts.push(await encodeAudioForTolino(raw.audio, ext));
  }

  const mp3 =
    mp3Parts.length === 1
      ? mp3Parts[0]!
      : await encodeAudioForTolino(await mergeMp3Buffers(mp3Parts), "in.mp3");

  return { mp3, modelSlug, voiceId };
}

/**
 * Vertone einen Track und speichere Meta in `idee.hoerbuch`.
 */
export async function synthesizeSachbuchHoerbuchTrack(input: {
  sachbuchId: string;
  trackId: string;
  provider?: string;
  voiceId?: string;
  style?: string;
}): Promise<{
  trackId: string;
  fileName: string;
  playUrl: string;
  byteSize: number;
  durationSec: number | null;
  modelSlug: string;
  provider: SachbuchHoerbuchTtsProvider;
}> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new UserFacingError("Sachbuch nicht gefunden.");

  const state = book.idee.hoerbuch;
  const track = findHoerbuchTrack(state, input.trackId);
  if (!track) {
    throw new UserFacingError(
      "Track nicht gefunden — zuerst Kapitel-Tracks fürs Hörbuch anlegen.",
    );
  }

  const provider = resolveProvider(input.provider ?? state.provider);
  const voiceId =
    (input.voiceId ?? state.voiceId).trim() ||
    sachbuchHoerbuchDefaultVoiceForProvider(provider);
  const style =
    (input.style ?? state.style).trim() || SACHBUCH_HOERBUCH_DEFAULT_STYLE;

  // Full spoken body is not stored in idee (preview only) — rebuild from chapters.
  // Intro credit follows the provider used for this synthesize call.
  const spoken =
    track.kapitelId === SACHBUCH_HOERBUCH_INTRO_KAPITEL_ID ||
    track.id === SACHBUCH_HOERBUCH_INTRO_KAPITEL_ID
      ? buildSachbuchHoerbuchIntroText(book, provider)
      : resolveHoerbuchTrackSpokenText(book, input.trackId) || track.text;
  // Intro/Outro are short credits (~60–120 chars); Kapitel need more body.
  if (spoken.trim().length < 20) {
    throw new UserFacingError(
      "Kein Vertonungstext für diesen Track — Tracks neu anlegen.",
    );
  }

  const { mp3, modelSlug } = await synthesizePlainToTolinoMp3({
    text: spoken,
    provider,
    voiceId,
    style,
  });
  const durationSec = await probeMp3DurationSec(mp3);
  const uploaded = await uploadSachbuchHoerbuchAudio({
    sachbuchId: book.id,
    fileName: track.fileName,
    audio: mp3,
  });

  const audio: SachbuchHoerbuchTrackAudio = {
    storagePath: uploaded.storagePath,
    byteSize: uploaded.byteSize,
    durationSec,
    modelSlug,
    voiceId,
    generatedAt: new Date().toISOString(),
  };

  const tracks = toPersistedHoerbuchTracks(
    state.tracks.map((t) => (t.id === track.id ? { ...t, audio } : t)),
  );

  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...state,
        provider,
        voiceId,
        style,
        tracks,
      },
    },
  });

  const playUrl = await createSachbuchHoerbuchSignedUrl(uploaded.storagePath);
  return {
    trackId: track.id,
    fileName: track.fileName,
    playUrl,
    byteSize: uploaded.byteSize,
    durationSec,
    modelSlug,
    provider,
  };
}

/**
 * Generate Tolino Hörprobe (1:30–3:00) from early book text.
 */
export async function synthesizeSachbuchHoerbuchSample(input: {
  sachbuchId: string;
  provider?: string;
  voiceId?: string;
  style?: string;
}): Promise<{
  fileName: string;
  playUrl: string;
  byteSize: number;
  durationSec: number;
  modelSlug: string;
  provider: SachbuchHoerbuchTtsProvider;
}> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new UserFacingError("Sachbuch nicht gefunden.");
  const state = book.idee.hoerbuch;
  if (!state.tracks.length) {
    throw new UserFacingError(
      "Keine Tracks — zuerst Kapitel-Tracks fürs Hörbuch anlegen.",
    );
  }

  const provider = resolveProvider(input.provider ?? state.provider);
  const voiceId =
    (input.voiceId ?? state.voiceId).trim() ||
    sachbuchHoerbuchDefaultVoiceForProvider(provider);
  const style =
    (input.style ?? state.style).trim() || SACHBUCH_HOERBUCH_DEFAULT_STYLE;

  // Rebuild full track texts for sample (persisted rows only keep previews).
  const sampleText = buildSachbuchHoerbuchSampleText(
    book,
    buildSachbuchHoerbuchTracks(book),
  );
  let { mp3, modelSlug } = await synthesizePlainToTolinoMp3({
    text: sampleText,
    provider,
    voiceId,
    style,
  });

  // Tolino Hörprobe: max 3:00. Always hard-cap audio — do not rely on probe alone
  // (failed/underestimated duration previously let overlong samples through).
  let durationSec = (await probeMp3DurationSec(mp3)) ?? 0;
  const needsCap =
    durationSec <= 0 || durationSec > SACHBUCH_HOERBUCH_SAMPLE_SAFE_MAX_SEC;
  if (needsCap) {
    // Probe unknown or overlong → cut to target (~2:00). `-t` on a shorter
    // file keeps the whole clip, so failed probes on short samples stay short.
    const trimmed = await trimMp3ToDurationSec(
      mp3,
      SACHBUCH_HOERBUCH_SAMPLE_TARGET_SEC,
    );
    mp3 = trimmed.audio;
    durationSec =
      (await probeMp3DurationSec(mp3)) ?? trimmed.durationSec;
  }
  if (durationSec > SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC) {
    const trimmed = await trimMp3ToDurationSec(
      mp3,
      SACHBUCH_HOERBUCH_SAMPLE_SAFE_MAX_SEC,
    );
    mp3 = trimmed.audio;
    durationSec =
      (await probeMp3DurationSec(mp3)) ?? trimmed.durationSec;
  }
  if (durationSec > SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC) {
    throw new UserFacingError(
      `Hörprobe ist nach Kürzen noch ${Math.round(durationSec)}s lang (Tolino max. ${SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC}s). Bitte erneut erzeugen.`,
    );
  }
  // Too short: leave as-is; UI warns — Tolino wants ≥ 90s.

  const fileName = sachbuchHoerbuchSampleFileName();
  const uploaded = await uploadSachbuchHoerbuchAudio({
    sachbuchId: book.id,
    fileName,
    audio: mp3,
  });

  const sample: SachbuchHoerbuchSample = {
    storagePath: uploaded.storagePath,
    fileName,
    byteSize: uploaded.byteSize,
    durationSec: durationSec || SACHBUCH_HOERBUCH_SAMPLE_TARGET_SEC,
    generatedAt: new Date().toISOString(),
  };

  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...state,
        provider,
        voiceId,
        style,
        tracks: toPersistedHoerbuchTracks(state.tracks),
        sample,
      },
    },
  });

  const playUrl = await createSachbuchHoerbuchSignedUrl(uploaded.storagePath);
  return {
    fileName,
    playUrl,
    byteSize: uploaded.byteSize,
    durationSec: sample.durationSec,
    modelSlug,
    provider,
  };
}

/**
 * Shorten an existing Hörprobe MP3 to Tolino’s max window — no TTS re-run.
 * Use when the sample is already too long for Tolino Media upload.
 */
export async function trimExistingSachbuchHoerbuchSample(input: {
  sachbuchId: string;
}): Promise<{
  fileName: string;
  playUrl: string;
  byteSize: number;
  durationSec: number;
  trimmed: boolean;
}> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new UserFacingError("Sachbuch nicht gefunden.");
  const state = book.idee.hoerbuch;
  const existing = state.sample;
  if (!existing?.storagePath) {
    throw new UserFacingError(
      "Keine Hörprobe vorhanden — zuerst erzeugen oder ZIP mit Probe.",
    );
  }

  let mp3 = await downloadSachbuchHoerbuchAudio(existing.storagePath);
  let durationSec = (await probeMp3DurationSec(mp3)) ?? existing.durationSec ?? 0;

  if (durationSec > 0 && durationSec <= SACHBUCH_HOERBUCH_SAMPLE_SAFE_MAX_SEC) {
    const playUrl = await createSachbuchHoerbuchSignedUrl(existing.storagePath);
    return {
      fileName: existing.fileName,
      playUrl,
      byteSize: existing.byteSize,
      durationSec,
      trimmed: false,
    };
  }

  const trimmed = await trimMp3ToDurationSec(
    mp3,
    SACHBUCH_HOERBUCH_SAMPLE_SAFE_MAX_SEC,
  );
  mp3 = trimmed.audio;
  durationSec =
    (await probeMp3DurationSec(mp3)) ?? trimmed.durationSec;

  if (durationSec > SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC) {
    throw new UserFacingError(
      `Hörprobe ist nach Kürzen noch ${Math.round(durationSec)}s (Tolino max. ${SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC}s).`,
    );
  }

  const fileName = existing.fileName || sachbuchHoerbuchSampleFileName();
  const uploaded = await uploadSachbuchHoerbuchAudio({
    sachbuchId: book.id,
    fileName,
    audio: mp3,
  });

  const sample: SachbuchHoerbuchSample = {
    storagePath: uploaded.storagePath,
    fileName,
    byteSize: uploaded.byteSize,
    durationSec,
    generatedAt: new Date().toISOString(),
  };

  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...state,
        tracks: toPersistedHoerbuchTracks(state.tracks),
        sample,
      },
    },
  });

  const playUrl = await createSachbuchHoerbuchSignedUrl(uploaded.storagePath);
  return {
    fileName,
    playUrl,
    byteSize: uploaded.byteSize,
    durationSec,
    trimmed: true,
  };
}
