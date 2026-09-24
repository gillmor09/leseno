/**
 * Build Quill-compatible `html_body` from API upload:
 * hero image (data URL) at the top + sanitized article body.
 */

import { sanitizeBlogHtml } from "@/lib/blog/sanitize-blog-html";

/** Same cap as Quill local image insert. */
export const BLOG_API_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

function normalizeMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

/**
 * Convert an uploaded File/Blob into a `data:image/…;base64,…` URL.
 */
export async function fileToBlogImageDataUrl(
  file: File,
  alt?: string,
): Promise<{ dataUrl: string; alt: string }> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new BlogApiImageError("Bild fehlt (image).");
  }
  if (file.size <= 0) {
    throw new BlogApiImageError("Bild-Datei ist leer.");
  }
  if (file.size > BLOG_API_MAX_IMAGE_BYTES) {
    throw new BlogApiImageError(
      "Bild ist zu groß (max. 3 MB). Bitte verkleinern.",
      413,
    );
  }

  const name = (file.name || "").toLowerCase();
  let mime = normalizeMime(file.type || "");
  if (!ALLOWED_MIME.has(mime)) {
    mime = name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : name.endsWith(".gif")
          ? "image/gif"
          : name.endsWith(".jpg") || name.endsWith(".jpeg")
            ? "image/jpeg"
            : "";
  }
  mime = normalizeMime(mime);
  if (!ALLOWED_MIME.has(mime)) {
    throw new BlogApiImageError(
      "Ungültiger Bildtyp — erlaubt: JPEG, PNG, WebP, GIF.",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    alt: (alt ?? "").trim().slice(0, 200),
  };
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
export function buildBlogHtmlFromParts(input: {
  body: string;
  dataUrl: string;
  alt?: string;
}): string {
  const imageHtml = buildHeroImageHtml(input.dataUrl, input.alt);
  const bodyNormalized = normalizeArticleBody(input.body);
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

/** From multipart: File → data URL → combined html_body. */
export async function buildBlogHtmlFromUpload(input: {
  body: string;
  image: File;
  alt?: string;
}): Promise<string> {
  const { dataUrl, alt } = await fileToBlogImageDataUrl(
    input.image,
    input.alt,
  );
  return buildBlogHtmlFromParts({
    body: input.body,
    dataUrl,
    alt,
  });
}
