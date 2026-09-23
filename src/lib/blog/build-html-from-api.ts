/**
 * Build Quill-compatible `html_body` from API payload:
 * hero image (data URL) at the top + sanitized article body.
 */

import { sanitizeBlogHtml } from "@/lib/blog/sanitize-blog-html";

/** Same cap as Quill local image insert. */
export const BLOG_API_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type BlogApiImageInput = {
  base64: string;
  mimeType?: string;
  alt?: string;
};

export class BlogApiImageError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BlogApiImageError";
    this.status = status;
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Normalize raw or data-URL base64 into a `data:image/…;base64,…` string.
 * Validates mime + decoded size (≤ 3 MB).
 */
export function toBlogImageDataUrl(image: BlogApiImageInput): string {
  const raw = (image.base64 ?? "").trim();
  if (!raw) {
    throw new BlogApiImageError("Bild fehlt (image.base64).");
  }

  let mime = (image.mimeType ?? "").trim().toLowerCase();
  let payload = raw;

  const dataMatch = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(raw);
  if (dataMatch) {
    mime = dataMatch[1]!.toLowerCase();
    payload = dataMatch[2]!.replace(/\s+/g, "");
  } else {
    payload = raw.replace(/\s+/g, "");
    if (!mime) {
      throw new BlogApiImageError(
        "image.mimeType angeben (z. B. image/jpeg), wenn base64 ohne data:-Prefix kommt.",
      );
    }
  }

  if (!ALLOWED_MIME.has(mime)) {
    throw new BlogApiImageError(
      "Ungültiger Bildtyp — erlaubt: JPEG, PNG, WebP, GIF.",
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    throw new BlogApiImageError("Bild-Base64 ist ungültig.");
  }
  if (!bytes.length) {
    throw new BlogApiImageError("Bild-Base64 ist leer.");
  }
  if (bytes.length > BLOG_API_MAX_IMAGE_BYTES) {
    throw new BlogApiImageError(
      "Bild ist zu groß (max. 3 MB). Bitte verkleinern.",
      413,
    );
  }

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Wrap a data URL as the leading Quill-style paragraph. */
export function buildHeroImageHtml(dataUrl: string, alt?: string): string {
  const safeAlt = escapeHtmlAttr((alt ?? "").trim().slice(0, 200));
  return `<p><img src="${dataUrl}" alt="${safeAlt}"></p>`;
}

/**
 * Plain text → `<p>` blocks; HTML left for sanitizer.
 * Heuristic: no block tags → treat as plain text with paragraphs.
 */
export function normalizeArticleBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const text = block
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\n", "<br>");
        return `<p>${text}</p>`;
      })
      .join("");
  }

  return trimmed;
}

/**
 * Hero image first, then body — one Quill-style `html_body` string
 * (data-URL `<img>` embedded, same as manual admin uploads).
 */
export function buildBlogHtmlFromApi(input: {
  body: string;
  image: BlogApiImageInput;
}): string {
  const dataUrl = toBlogImageDataUrl(input.image);
  const imageHtml = buildHeroImageHtml(dataUrl, input.image.alt);
  const bodyNormalized = normalizeArticleBody(input.body);
  // Sanitize the combined document so the stored field matches Quill output
  // (image + paragraphs in one html_body, data: URLs kept).
  const htmlBody = sanitizeBlogHtml(`${imageHtml}${bodyNormalized}`);
  if (!htmlBody.includes("<img")) {
    throw new BlogApiImageError(
      "Bild konnte nicht in den Artikeltext übernommen werden.",
    );
  }
  if (htmlBody.length > 8_000_000) {
    throw new BlogApiImageError(
      "Artikeltext inkl. Bild ist zu groß (max. ca. 8 MB).",
      413,
    );
  }
  return htmlBody;
}
