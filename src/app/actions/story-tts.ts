"use server";

/**
 * Story read-aloud: catalog TTS → merged MP3 → Storage (preferred) or compact base64.
 * Mid/long stories used to fail with ElevenLabs mainly due to sequential chunking,
 * concurrent request limits, and huge multi-chunk Server Action payloads.
 */

import { createHash } from "node:crypto";

import {
  isTtsQuotaUserFacingError,
  resolveElevenLabsQuotaFallbackConfig,
  resolveTtsModelConfig,
  synthesizeSpeechChunk,
  type ResolvedTtsModelConfig,
} from "@/lib/ai/synthesize-speech";
import { mapWithConcurrency, mergeMp3Buffers } from "@/lib/ai/tts-mp3";
import { transcribeSpeechWordsWithWhisper } from "@/lib/ai/openai-whisper";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserFacingMessage, UserFacingError } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import {
  chunkTextForTts,
  countPlainTextWords,
  TTS_STORAGE_PREFERRED_WORD_COUNT,
  ttsChunkMaxCharsForProvider,
} from "@/lib/stories/plain-text-from-html";
import { mp3DownloadFileName, storyTtsPlayPath } from "@/lib/stories/tts-download-name";
import {
  getMyStoryTtsMeta,
  uploadStoryTtsAudio,
} from "@/lib/stories/tts-storage";
import {
  alignWhisperWordsToCanonical,
  canonicalSliceForChunk,
  tokenizeStoryWords,
  type AlignedTtsWord,
} from "@/lib/stories/tts-word-align";
import type { ActionResult } from "@/lib/types/actions";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import "@/lib/validations/configure-zod";
import { z } from "zod";

/** Spoken story body only — not layout, facts card, or embedded images. */
const MAX_PLAIN_TEXT_CHARS = 80_000;

/** Max base64 payload without Storage (~1.5 MB audio → ~2 MB JSON). */
const MAX_INLINE_AUDIO_BYTES = 1_400_000;

const storyTtsSchema = z.object({
  storyText: z
    .string()
    .trim()
    .min(1, { message: "Es gibt noch keine Geschichte zum Vorlesen." })
    .max(MAX_PLAIN_TEXT_CHARS, {
      message: "Die Geschichte ist zu lang zum Vorlesen.",
    }),
  /** When true, run Whisper for word timings (cost + latency). */
  wordHighlight: z.boolean().default(false),
  /** Library story id — enables Storage cache + seekable signed URL. */
  libraryStoryId: z.string().uuid().nullable().optional(),
});

export type StoryTtsWordTiming = AlignedTtsWord;

export type StoryTtsResult = {
  /** App proxy URL (persisted) or null when using inline base64. */
  audioUrl: string | null;
  /** Compact single MP3 when Storage is unavailable (short stories only). */
  audioBase64: string | null;
  mimeType: "audio/mpeg";
  /** Suggested filename for browser download (`Titel.mp3`). */
  downloadFileName: string;
  /** Global word timings for the merged audio timeline. */
  words: StoryTtsWordTiming[];
  modelSlug: string;
  persisted: boolean;
};

const TTS_FALLBACK =
  "Vorlesen hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.";

function hashStoryText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function titleFromStoryPlainText(text: string): string {
  const firstLine = text.trim().split(/\n/)[0]?.trim() ?? "";
  return firstLine.slice(0, 120) || "Geschichte";
}

function parseStoredWordTimings(value: unknown): StoryTtsWordTiming[] {
  if (!Array.isArray(value)) return [];
  const words: StoryTtsWordTiming[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.index === "number" &&
      typeof row.start === "number" &&
      typeof row.end === "number"
    ) {
      words.push({
        index: row.index,
        start: row.start,
        end: row.end,
      });
    }
  }
  return words;
}

/** Provider concurrency: ElevenLabs free/starter often allows only ~2 parallel; use 1 to fail-fast on quota. */
function ttsConcurrencyForProvider(provider: string): number {
  if (provider === "elevenlabs") return 1;
  if (provider === "inworld") return 2;
  return 3;
}

/**
 * Synthesizes (or reuses) one merged MP3 for the story body.
 * Prefer Supabase Storage when `libraryStoryId` is set — required for long stories.
 */
export async function synthesizeStorySpeechAction(
  input: unknown,
): Promise<ActionResult<StoryTtsResult>> {
  const botError = await assertBotGuard(input, {
    action: "story-tts",
    minFillMs: 1500,
    maxRequests: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = storyTtsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  const packageFeatures = await loadFeaturesForCurrentUser();
  if (!featuresInclude(packageFeatures, "vorlesen")) {
    return {
      success: false,
      error: "Vorlesen gehört nicht zu deinem Paket.",
    };
  }

  try {
    const plain = parsed.data.storyText;
    const libraryStoryId = parsed.data.libraryStoryId ?? null;
    const wordHighlight =
      parsed.data.wordHighlight &&
      featuresInclude(packageFeatures, "markierung");
    const sourceHash = hashStoryText(plain);
    const wordCount = countPlainTextWords(plain);
    const storyTitle = titleFromStoryPlainText(plain);
    const downloadFileName = mp3DownloadFileName(storyTitle);

    if (
      !libraryStoryId &&
      wordCount >= TTS_STORAGE_PREFERRED_WORD_COUNT
    ) {
      return {
        success: false,
        error:
          "Lange Geschichten speichern wir als Audio im Speicher. Bitte speichere die Geschichte zuerst (Bücherei), dann kannst du sie vorlesen und spulen.",
      };
    }

    // Cache hit: same text hash → play via titled proxy URL (no re-synthesis).
    if (libraryStoryId) {
      const cached = await getMyStoryTtsMeta(libraryStoryId);
      if (cached && cached.sourceHash === sourceHash) {
        const cachedWords = parseStoredWordTimings(cached.wordTimings);
        const timingsOk = !wordHighlight || cachedWords.length > 0;
        if (timingsOk) {
          return {
            success: true,
            data: {
              audioUrl: storyTtsPlayPath(libraryStoryId, storyTitle),
              audioBase64: null,
              mimeType: "audio/mpeg",
              downloadFileName,
              words: wordHighlight ? cachedWords : [],
              modelSlug: cached.modelSlug ?? "cached",
              persisted: true,
            },
          };
        }
      }
    }

    let ttsModel = await resolveTtsModelConfig();
    const fullTokens = wordHighlight ? tokenizeStoryWords(plain) : [];

    type ChunkAudio = {
      audio: Buffer;
      words: StoryTtsWordTiming[];
      modelSlug: string;
    };

    async function synthesizeAllChunks(
      model: ResolvedTtsModelConfig,
    ): Promise<ChunkAudio[]> {
      const textChunks = chunkTextForTts(
        plain,
        ttsChunkMaxCharsForProvider(model.provider),
      );
      if (textChunks.length === 0) {
        throw new UserFacingError(TTS_FALLBACK);
      }
      const concurrency = ttsConcurrencyForProvider(model.provider);
      return mapWithConcurrency(
        textChunks,
        concurrency,
        async (chunk): Promise<ChunkAudio> => {
          const result = await synthesizeSpeechChunk({
            text: chunk,
            provider: model.provider,
            modelSlug: model.modelSlug,
            voiceId: model.voiceId,
            // Story-level handles ElevenLabs quota once (avoids N failed API calls).
            disableQuotaFallback: true,
          });

          let words: StoryTtsWordTiming[] = [];
          if (wordHighlight) {
            try {
              const { tokens, offset } = canonicalSliceForChunk({
                fullText: plain,
                chunkText: chunk,
                fullTokens,
              });
              const whisper = await transcribeSpeechWordsWithWhisper({
                audio: result.audio,
                prompt: chunk,
              });
              words = alignWhisperWordsToCanonical({
                canonicalWords: tokens,
                whisperWords: whisper.words,
                canonicalOffset: offset,
              });
            } catch (whisperError) {
              console.error(
                "[synthesizeStorySpeechAction] whisper",
                whisperError,
              );
              words = [];
            }
          }

          return {
            audio: result.audio,
            words,
            modelSlug: result.modelSlug,
          };
        },
      );
    }

    let chunkResults: ChunkAudio[];
    try {
      chunkResults = await synthesizeAllChunks(ttsModel);
    } catch (primaryError) {
      if (
        ttsModel.provider === "elevenlabs" &&
        isTtsQuotaUserFacingError(primaryError)
      ) {
        const fallback = resolveElevenLabsQuotaFallbackConfig();
        if (!fallback) throw primaryError;
        console.warn(
          `[synthesizeStorySpeechAction] ElevenLabs-Kontingent → Fallback ${fallback.provider}/${fallback.modelSlug}`,
        );
        ttsModel = fallback;
        chunkResults = await synthesizeAllChunks(fallback);
      } else {
        throw primaryError;
      }
    }

    const merged = mergeMp3Buffers(chunkResults.map((part) => part.audio));
    const modelSlug = chunkResults[0]?.modelSlug ?? ttsModel.modelSlug;

    // Shift per-chunk word times onto the merged timeline.
    const words: StoryTtsWordTiming[] = [];
    let timeOffset = 0;
    for (const part of chunkResults) {
      for (const word of part.words) {
        words.push({
          ...word,
          start: word.start + timeOffset,
          end: word.end + timeOffset,
        });
      }
      const lastEnd = part.words.reduce(
        (max, word) => Math.max(max, word.end),
        0,
      );
      if (lastEnd > 0) {
        timeOffset += lastEnd;
      } else {
        // Fallback: estimate from 64 kbps CBR size when Whisper missing.
        timeOffset += (part.audio.byteLength * 8) / (64 * 1000);
      }
    }

    if (libraryStoryId) {
      const user = await getCurrentUser();
      if (!user) {
        throw new UserFacingError("Bitte melde dich an, um vorzulesen.");
      }
      await uploadStoryTtsAudio({
        userId: user.id,
        storyId: libraryStoryId,
        audio: merged,
        modelSlug,
        sourceHash,
        wordTimingsJson: wordHighlight && words.length > 0 ? words : null,
      });
      return {
        success: true,
        data: {
          audioUrl: storyTtsPlayPath(libraryStoryId, storyTitle),
          audioBase64: null,
          mimeType: "audio/mpeg",
          downloadFileName,
          words,
          modelSlug,
          persisted: true,
        },
      };
    }

    if (merged.byteLength > MAX_INLINE_AUDIO_BYTES) {
      return {
        success: false,
        error:
          "Das Audio ist zu groß für den Direktversand. Bitte speichere die Geschichte zuerst, dann liegt das Vorlesen im Speicher.",
      };
    }

    return {
      success: true,
      data: {
        audioUrl: null,
        audioBase64: merged.toString("base64"),
        mimeType: "audio/mpeg",
        downloadFileName,
        words,
        modelSlug,
        persisted: false,
      },
    };
  } catch (error) {
    console.error("[synthesizeStorySpeechAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, TTS_FALLBACK),
    };
  }
}
