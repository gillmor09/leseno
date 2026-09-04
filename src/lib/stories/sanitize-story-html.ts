/**
 * Sanitizes AI story HTML before rendering in the story card.
 * Allowlist covers headings, paragraphs, lists, and basic emphasis only.
 */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "blockquote",
  "span",
];

const ALLOWED_ATTR = ["class"];

/**
 * True when the string contains markup that should be rendered as HTML.
 */
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(text);
}

/**
 * Strips markdown fences and sanitizes story HTML for safe display.
 */
export function sanitizeStoryHtml(raw: string): string {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return DOMPurify.sanitize(withoutFence, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
