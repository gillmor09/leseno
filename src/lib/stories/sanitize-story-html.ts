/**
 * Sanitizes AI story HTML before it leaves the server (pipeline / actions).
 * Marked server-only so isomorphic-dompurify stays out of the client bundle.
 */

import "server-only";
import DOMPurify from "isomorphic-dompurify";
import { looksLikeHtml } from "@/lib/stories/looks-like-html";

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
  "img",
];

const ALLOWED_ATTR = ["class", "src", "alt", "width", "height", "loading"];

export { looksLikeHtml };

/**
 * Strips markdown fences and sanitizes story HTML for safe display.
 * Allows data: image URLs for embedded FLUX illustrations.
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
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
