"use server";

/**
 * Story read-aloud: plain story text → OpenAI TTS → Whisper word timestamps.
 * Client highlights words via returned `words[]` (not page HTML / images).
 */

import { synthesizeSpeechWithOpenAi } from "@/lib/ai/openai-tts";
import { transcribeSpeechWordsWithWhisper } from "@/lib/ai/openai-whisper";
import { toUserFacingMessage, UserFacingError } from "@/lib/errors/user-facing";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { chunkTextForTts } from "@/lib/stories/plain-text-from-html";
import {
  alignWhisperWordsToCanonical,
  canonicalSliceForChunk,
  tokenizeStoryWords,
  type AlignedTtsWord,
} from "@/lib/stories/tts-word-align";
import type { ActionResult } from "@/lib/types/actions";
import "@/lib/validations/configure-zod";
import { z } from "zod";

/** Spoken story body only — not layout, facts card, or embedded images. */
const MAX_PLAIN_TEXT_CHARS = 40_000;

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
});

export type StoryTtsWordTiming = AlignedTtsWord;

export type StoryTtsChunk = {
  audioBase64: string;
  mimeType: "audio/mpeg";
  /** Word timings relative to this chunk's audio (global `index`). */
  words: StoryTtsWordTiming[];
};

export type StoryTtsResult = {
  chunks: StoryTtsChunk[];
  modelSlug: string;
};

const TTS_FALLBACK =
  "Vorlesen hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.";

/**
 * Synthesizes MP3 audio for the story body.
 * Optional Whisper word timings when `wordHighlight` is true.
 * Client must strip HTML/images first (`plainTextFromStoryHtml`).
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

  try {
    const plain = parsed.data.storyText;
    const wordHighlight = parsed.data.wordHighlight;
    const textChunks = chunkTextForTts(plain);
    const fullTokens = wordHighlight ? tokenizeStoryWords(plain) : [];
    const audioChunks: StoryTtsChunk[] = [];
    let modelSlug = "";

    for (const chunk of textChunks) {
      // Tempo is applied in the browser (playbackRate); synthesize at normal speed.
      const result = await synthesizeSpeechWithOpenAi({ text: chunk });
      modelSlug = result.modelSlug;

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

      audioChunks.push({
        audioBase64: result.audio.toString("base64"),
        mimeType: result.mimeType,
        words,
      });
    }

    if (audioChunks.length === 0) {
      throw new UserFacingError(TTS_FALLBACK);
    }

    return {
      success: true,
      data: { chunks: audioChunks, modelSlug },
    };
  } catch (error) {
    console.error("[synthesizeStorySpeechAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, TTS_FALLBACK),
    };
  }
}
