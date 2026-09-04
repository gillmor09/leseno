/**
 * Lightweight HTML detection for story bodies (no DOMPurify — safe for client).
 */

/**
 * True when the string contains markup that should be rendered as HTML.
 */
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(text);
}
