/**
 * Align Whisper word timestamps to the canonical story word list used for TTS.
 * Indices are global positions in the full story plain text.
 */

export type AlignedTtsWord = {
  /** Global word index in the story plain text. */
  index: number;
  /** Seconds from the start of this audio chunk. */
  start: number;
  end: number;
};

export type WhisperTimedWord = {
  word: string;
  start: number;
  end: number;
};

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/**
 * Tokenizes story plain text into spoken word tokens (same order as DOM wraps).
 */
export function tokenizeStoryWords(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

/**
 * Normalizes a token for fuzzy compare (case, punctuation, whitespace).
 */
export function normalizeWordToken(word: string): string {
  return word
    .normalize("NFC")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/['’]/g, "");
}

function tokensEqual(a: string, b: string): boolean {
  const na = normalizeWordToken(a);
  const nb = normalizeWordToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Whisper sometimes merges compounds or drops endings slightly.
  if (na.startsWith(nb) || nb.startsWith(na)) {
    return Math.min(na.length, nb.length) >= 3;
  }
  return false;
}

/**
 * Maps Whisper timings onto canonical tokens for one TTS chunk.
 * `canonicalOffset` is the global index of the first word in this chunk.
 */
export function alignWhisperWordsToCanonical(input: {
  canonicalWords: string[];
  whisperWords: WhisperTimedWord[];
  canonicalOffset: number;
}): AlignedTtsWord[] {
  const { canonicalWords, whisperWords, canonicalOffset } = input;
  if (canonicalWords.length === 0 || whisperWords.length === 0) {
    return [];
  }

  const aligned: AlignedTtsWord[] = [];
  let c = 0;

  for (const whisper of whisperWords) {
    if (c >= canonicalWords.length) break;

    let matched = false;
    // Small look-ahead window for insertions/skips from Whisper.
    const windowEnd = Math.min(canonicalWords.length, c + 4);
    for (let j = c; j < windowEnd; j += 1) {
      if (tokensEqual(canonicalWords[j]!, whisper.word)) {
        aligned.push({
          index: canonicalOffset + j,
          start: whisper.start,
          end: Math.max(whisper.end, whisper.start + 0.05),
        });
        c = j + 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Consume one canonical slot with this timing (keeps sync moving).
      aligned.push({
        index: canonicalOffset + c,
        start: whisper.start,
        end: Math.max(whisper.end, whisper.start + 0.05),
      });
      c += 1;
    }
  }

  return aligned;
}

/**
 * Splits full-story tokens into the slice belonging to a TTS text chunk
 * by locating the chunk string inside the joined story (best-effort).
 */
export function canonicalSliceForChunk(input: {
  fullText: string;
  chunkText: string;
  fullTokens: string[];
}): { tokens: string[]; offset: number } {
  const { fullText, chunkText, fullTokens } = input;
  const chunkTokens = tokenizeStoryWords(chunkText);
  if (chunkTokens.length === 0) {
    return { tokens: [], offset: 0 };
  }

  // Prefer exact token-sequence search.
  for (let start = 0; start <= fullTokens.length - chunkTokens.length; start += 1) {
    let ok = true;
    for (let i = 0; i < chunkTokens.length; i += 1) {
      if (
        normalizeWordToken(fullTokens[start + i]!) !==
        normalizeWordToken(chunkTokens[i]!)
      ) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return {
        tokens: fullTokens.slice(start, start + chunkTokens.length),
        offset: start,
      };
    }
  }

  // Fallback: character index → approximate token offset.
  const at = fullText.indexOf(chunkText);
  if (at >= 0) {
    const before = tokenizeStoryWords(fullText.slice(0, at));
    return {
      tokens: chunkTokens,
      offset: before.length,
    };
  }

  return { tokens: chunkTokens, offset: 0 };
}
