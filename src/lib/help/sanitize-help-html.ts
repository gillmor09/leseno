/**
 * Help text HTML sanitization for in-app dialogs (Quill output).
 */

import "server-only";
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
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "span",
];

/** `style` / `class` keep Quill size + color formats after sanitize. */
const ALLOWED_ATTR = ["href", "target", "rel", "class", "style"];

/**
 * Sanitizes Quill HTML for safe help-dialog rendering.
 */
export function sanitizeHelpHtml(raw: string): string {
  return DOMPurify.sanitize(raw.trim(), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
