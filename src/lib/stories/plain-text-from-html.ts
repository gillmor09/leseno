/**
 * Plain text for TTS: strip story HTML (incl. silbe spans) to readable German.
 */

const MAX_TTS_CHARS = 3500;

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
 * Splits long text into chunks under OpenAI TTS input limits (sentence-aware).
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
