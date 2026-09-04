/**
 * OpenAI Whisper transcription with word-level timestamps.
 * Used after TTS so the client can highlight spoken words.
 */

import { getOpenAiApiKey, getOpenAiBaseUrl } from "@/lib/ai/openai";

export type WhisperWordTiming = {
  word: string;
  start: number;
  end: number;
};

export type WhisperVerboseResult = {
  text: string;
  words: WhisperWordTiming[];
};

type WhisperApiWord = {
  word?: string;
  start?: number;
  end?: number;
};

type WhisperApiPayload = {
  text?: string;
  words?: WhisperApiWord[];
};

/**
 * Transcribes MP3 speech and returns word start/end times (seconds).
 * Model: whisper-1 (supports timestamp_granularities=word).
 */
export async function transcribeSpeechWordsWithWhisper(input: {
  audio: Buffer;
  /** Bias prompt — pass the TTS chunk text (truncated). */
  prompt?: string;
  filename?: string;
}): Promise<WhisperVerboseResult> {
  const apiKey = getOpenAiApiKey();
  const baseUrl = getOpenAiBaseUrl();
  const filename = input.filename?.trim() || "speech.mp3";

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.audio)], { type: "audio/mpeg" }),
    filename,
  );
  form.append("model", "whisper-1");
  form.append("language", "de");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const prompt = input.prompt?.trim();
  if (prompt) {
    form.append("prompt", prompt.slice(0, 800));
  }

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      detail = payload.error?.message?.trim() ?? "";
    } catch {
      detail = "";
    }
    throw new Error(
      detail || `OpenAI-Whisper fehlgeschlagen (${response.status}).`,
    );
  }

  const payload = (await response.json()) as WhisperApiPayload;
  const words: WhisperWordTiming[] = [];
  for (const entry of payload.words ?? []) {
    const word = entry.word?.trim() ?? "";
    const start = entry.start;
    const end = entry.end;
    if (
      !word ||
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      continue;
    }
    words.push({ word, start, end });
  }

  return {
    text: payload.text?.trim() ?? "",
    words,
  };
}
