/**
 * Blog article HTML sanitization (Quill output with images, tables, size/color).
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
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "class",
  "style",
  "src",
  "alt",
  "width",
  "height",
  "colspan",
  "rowspan",
  "data-row",
];

/**
 * Sanitizes Quill blog HTML for safe public rendering.
 * Allows data: image URLs (embedded uploads) and table markup from Quill.
 */
export function sanitizeBlogHtml(raw: string): string {
  return DOMPurify.sanitize(raw.trim(), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
