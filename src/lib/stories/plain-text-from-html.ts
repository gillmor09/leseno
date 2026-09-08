/**
 * Plain text for TTS: strip story HTML (incl. silbe spans) to readable German.
 */

/** OpenAI `/audio/speech` input is ~4096; keep margin. */
export const MAX_TTS_CHARS_OPENAI = 3500;

/** Inworld sync TTS rejects text over 2000 characters. */
export const MAX_TTS_CHARS_INWORLD = 1900;

/** Fish Audio handles longer text; keep same margin as OpenAI. */
export const MAX_TTS_CHARS_FISH = 3500;

/**
 * Eleven v3 sync TTS max is 5000 characters.
 * Stay well under the limit: mid-length stories otherwise hit timeouts / concurrent caps.
 */
export const MAX_TTS_CHARS_ELEVENLABS = 3200;

/** Prefer Storage upload once story plain text exceeds this many words. */
export const TTS_STORAGE_PREFERRED_WORD_COUNT = 5000;

const MAX_TTS_CHARS = MAX_TTS_CHARS_OPENAI;

/**
 * Max characters per synthesis request for the active TTS provider.
 */
export function ttsChunkMaxCharsForProvider(provider: string): number {
  switch (provider) {
    case "inworld":
      return MAX_TTS_CHARS_INWORLD;
    case "fish-audio":
      return MAX_TTS_CHARS_FISH;
    case "elevenlabs":
      return MAX_TTS_CHARS_ELEVENLABS;
    case "openai-tts":
    default:
      return MAX_TTS_CHARS_OPENAI;
  }
}

/**
 * Converts sanitized story HTML to spoken plain text.
 */
export function plainTextFromStoryHtml(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|h1|h2|h3|h4|li|div|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
  return withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Splits long text into chunks under provider TTS input limits (sentence-aware).
 */
export function chunkTextForTts(
  text: string,
  maxChars = MAX_TTS_CHARS,
): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf(".\n"),
      window.lastIndexOf("\n\n"),
    );
    const splitAt =
      sentenceEnd > maxChars * 0.4 ? sentenceEnd + 1 : maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks.filter(Boolean);
}

/** Whitespace-separated word count for Storage / size heuristics. */
export function countPlainTextWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
