/**
 * Server-side Hörbuch chapter synthesis (TTS / Dialogue batches) → Storage.
 * Used by `/api/admin/roman-hoerbuch/chapter` (long maxDuration).
 */

import { synthesizeDialogueWithElevenLabs } from "@/lib/ai/elevenlabs-dialogue";
import {
  resolveTtsModelConfig,
  synthesizeSpeechChunk,
} from "@/lib/ai/synthesize-speech";
import { mergeMp3Buffers } from "@/lib/ai/tts-mp3";
import { UserFacingError } from "@/lib/errors/user-facing";
import type { RomanHoerbuchAudioChapter } from "@/lib/roman/editorial";
import {
  batchDialogueInputs,
  listRomanHoerbuchCastingRoles,
  mapTurnsToDialogueInputs,
  ROMAN_HOERBUCH_NARRATOR_KEY,
  splitChapterIntoDialogueTurns,
  validateRomanHoerbuchCasting,
  type RomanHoerbuchCasting,
  type RomanHoerbuchDialogueInput,
} from "@/lib/roman/hoerbuch-dialogue";
import {
  createRomanHoerbuchSignedUrl,
  ROMAN_HOERBUCH_MIME,
  uploadRomanHoerbuchAudio,
} from "@/lib/roman/hoerbuch-storage";
import {
  isRomanHoerbuchLanguageCode,
  romanChapterSpokenText,
  romanHoerbuchChapterFilename,
} from "@/lib/roman/export-roman-hoerbuch";
import {
  collectExportChaptersFromEditorial,
  type RomanExportProseSource,
} from "@/lib/roman/export-roman-pdf";
import { getRomanKontext, setRomanEditorial } from "@/lib/roman/repository";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  chunkTextForTts,
  MAX_TTS_CHARS_ELEVENLABS_HOERBUCH,
  ttsChunkMaxCharsForModel,
} from "@/lib/stories/plain-text-from-html";

export type SynthesizeRomanHoerbuchChapterInput = {
  romanId: string;
  chapterNumber: number;
  languageCode: string;
  proseSource?: RomanExportProseSource;
  mode?: "single" | "cast";
  casting?: RomanHoerbuchCasting;
};

export type SynthesizeRomanHoerbuchChapterResult = {
  chapterNumber: number;
  fileName: string;
  playUrl: string;
  byteSize: number;
  mimeType: "audio/mpeg";
  modelSlug: string;
  provider: string;
  languageCode: string;
  mode: "single" | "cast";
  proseSource: RomanExportProseSource;
  charCount: number;
  chunkCount: number;
  meta: RomanHoerbuchAudioChapter;
};

type PreparedChapter = {
  spoken: string;
  fileName: string;
  mode: "single" | "cast";
  modelSlug: string;
  provider: string;
  voiceId: string | null;
  textChunks: string[];
  dialogueBatches: RomanHoerbuchDialogueInput[][];
  proseSource: RomanExportProseSource;
};

async function prepareChapter(input: {
  romanId: string;
  chapterNumber: number;
  proseSource?: RomanExportProseSource;
  mode: "single" | "cast";
  casting: RomanHoerbuchCasting;
}): Promise<PreparedChapter> {
  const roman = await getRomanKontext(input.romanId, { omitCover: true });
  if (!roman) throw new UserFacingError("Roman nicht gefunden.");

  const hasRoman = (roman.editorial.romanText ?? "").trim().length >= 40;
  const source: RomanExportProseSource =
    roman.editorial.buchTyp === "clever_erzaehlt"
      ? "manuskript"
      : input.proseSource === "roman" || input.proseSource === "manuskript"
        ? input.proseSource === "roman" && !hasRoman
          ? "manuskript"
          : input.proseSource
        : hasRoman
          ? "roman"
          : "manuskript";

  const chapters = collectExportChaptersFromEditorial(roman.editorial, {
    source,
  });
  const chapter = chapters.find((c) => c.number === input.chapterNumber);
  if (!chapter) {
    throw new UserFacingError(
      `Kapitel ${input.chapterNumber} nicht gefunden (Quelle: ${source}).`,
    );
  }

  const spoken = romanChapterSpokenText(chapter);
  if (spoken.length < 40) {
    throw new UserFacingError(
      `Kapitel ${input.chapterNumber} ist zu kurz zum Vorlesen (${spoken.length} Zeichen).`,
    );
  }

  const model = await resolveTtsModelConfig();
  const fileName = romanHoerbuchChapterFilename(chapter);

  if (input.mode === "cast") {
    if ((model.provider || "").toLowerCase() !== "elevenlabs") {
      throw new UserFacingError(
        "Mehrere Charaktere brauchen ElevenLabs als Vorlese-Anbieter (Admin → KI-Modelle → Vorlesen).",
      );
    }
    const roles = listRomanHoerbuchCastingRoles(roman.charaktere ?? []);
    const castError = validateRomanHoerbuchCasting(
      input.casting,
      roles.map((r) => r.key),
    );
    if (castError) throw new UserFacingError(castError);

    const modelSlug = /^eleven_v4/i.test(model.modelSlug)
      ? model.modelSlug
      : "eleven_v4";
    const casting: RomanHoerbuchCasting = {
      ...input.casting,
      [ROMAN_HOERBUCH_NARRATOR_KEY]:
        input.casting[ROMAN_HOERBUCH_NARRATOR_KEY]?.trim() ||
        model.voiceId?.trim() ||
        "",
    };
    const turns = splitChapterIntoDialogueTurns({
      spokenText: spoken,
      charaktere: (roman.charaktere ?? []) as RomanCharakter[],
    });
    const dialogueInputs = mapTurnsToDialogueInputs(turns, casting);
    const dialogueBatches = batchDialogueInputs(dialogueInputs);
    if (dialogueBatches.length === 0) {
      throw new UserFacingError("Kein vorlesbarer Text im Kapitel.");
    }
    return {
      spoken,
      fileName,
      mode: "cast",
      modelSlug,
      provider: "elevenlabs",
      voiceId: model.voiceId,
      textChunks: [],
      dialogueBatches,
      proseSource: source,
    };
  }

  const maxChars =
    (model.provider || "").toLowerCase() === "elevenlabs"
      ? Math.min(
          MAX_TTS_CHARS_ELEVENLABS_HOERBUCH,
          ttsChunkMaxCharsForModel(model.provider, model.modelSlug),
        )
      : ttsChunkMaxCharsForModel(model.provider, model.modelSlug);
  const textChunks = chunkTextForTts(spoken, maxChars);
  if (textChunks.length === 0) {
    throw new UserFacingError("Kein vorlesbarer Text im Kapitel.");
  }

  return {
    spoken,
    fileName,
    mode: "single",
    modelSlug: model.modelSlug,
    provider: model.provider,
    voiceId: model.voiceId,
    textChunks,
    dialogueBatches: [],
    proseSource: source,
  };
}

async function synthesizePreparedAudio(
  prepared: PreparedChapter,
  languageCode: string,
): Promise<{ audio: Buffer; chunkCount: number }> {
  const parts: Buffer[] = [];
  let previousRequestIds: string[] = [];
  let previousText = "";

  if (prepared.mode === "cast") {
    for (let i = 0; i < prepared.dialogueBatches.length; i += 1) {
      const batch = prepared.dialogueBatches[i]!;
      const result = await synthesizeDialogueWithElevenLabs({
        inputs: batch,
        modelSlug: prepared.modelSlug,
        languageCode,
        previousText: previousRequestIds.length ? null : previousText || null,
        previousRequestIds:
          previousRequestIds.length > 0 ? previousRequestIds : null,
      });
      parts.push(result.audio);
      if (result.requestId) {
        previousRequestIds = [...previousRequestIds, result.requestId].slice(
          -3,
        );
      }
      previousText = batch
        .map((b) => b.text)
        .join(" ")
        .slice(-100);
    }
    return {
      audio: mergeMp3Buffers(parts),
      chunkCount: prepared.dialogueBatches.length,
    };
  }

  for (let i = 0; i < prepared.textChunks.length; i += 1) {
    const chunk = prepared.textChunks[i]!;
    const result = await synthesizeSpeechChunk({
      text: chunk,
      provider: prepared.provider,
      modelSlug: prepared.modelSlug,
      voiceId: prepared.voiceId,
      languageCode,
      previousText: previousRequestIds.length ? null : previousText || null,
      previousRequestIds:
        previousRequestIds.length > 0 ? previousRequestIds : null,
      disableQuotaFallback: false,
    });
    parts.push(result.audio);
    if (result.requestId) {
      previousRequestIds = [...previousRequestIds, result.requestId].slice(-3);
    }
    previousText = chunk.slice(-100);
  }
  return {
    audio: mergeMp3Buffers(parts),
    chunkCount: prepared.textChunks.length,
  };
}

/**
 * Synthesizes one chapter, uploads MP3 to Storage, persists meta on editorial.
 */
export async function synthesizeRomanHoerbuchChapterToStorage(
  input: SynthesizeRomanHoerbuchChapterInput,
): Promise<SynthesizeRomanHoerbuchChapterResult> {
  const lang = input.languageCode.trim().toLowerCase();
  if (!isRomanHoerbuchLanguageCode(lang)) {
    throw new UserFacingError("Diese Sprache ist nicht wählbar.");
  }

  const mode = input.mode ?? "single";
  const casting = (input.casting ?? {}) as RomanHoerbuchCasting;

  const prepared = await prepareChapter({
    romanId: input.romanId,
    chapterNumber: input.chapterNumber,
    proseSource: input.proseSource,
    mode,
    casting,
  });

  const { audio, chunkCount } = await synthesizePreparedAudio(prepared, lang);
  if (audio.byteLength < 100) {
    throw new UserFacingError("ElevenLabs lieferte kein nutzbares Audio.");
  }

  const { storagePath, byteSize } = await uploadRomanHoerbuchAudio({
    romanId: input.romanId,
    chapterNumber: input.chapterNumber,
    audio,
  });

  const meta: RomanHoerbuchAudioChapter = {
    storagePath,
    fileName: prepared.fileName,
    byteSize,
    mimeType: ROMAN_HOERBUCH_MIME,
    languageCode: lang,
    proseSource: prepared.proseSource,
    mode: prepared.mode,
    modelSlug: prepared.modelSlug,
    provider: prepared.provider,
    charCount: prepared.spoken.length,
    chunkCount,
    updatedAt: new Date().toISOString(),
  };

  const roman = await getRomanKontext(input.romanId, { omitCover: true });
  if (!roman) throw new UserFacingError("Roman nicht gefunden.");
  const nextAudio = {
    ...(roman.editorial.hoerbuchAudio ?? {}),
    [String(input.chapterNumber)]: meta,
  };
  await setRomanEditorial(input.romanId, {
    ...roman.editorial,
    hoerbuchAudio: nextAudio,
  });

  const playUrl = await createRomanHoerbuchSignedUrl(storagePath);

  return {
    chapterNumber: input.chapterNumber,
    fileName: prepared.fileName,
    playUrl,
    byteSize,
    mimeType: "audio/mpeg",
    modelSlug: prepared.modelSlug,
    provider: prepared.provider,
    languageCode: lang,
    mode: prepared.mode,
    proseSource: prepared.proseSource,
    charCount: prepared.spoken.length,
    chunkCount,
    meta,
  };
}
