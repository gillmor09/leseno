/**
 * Shared FLUX.2 prompt guards.
 * Story + social pixels: hard no-text (FLUX paints prose as glyphs).
 * Social Winkel typography is composited in code (`overlay-angle-text.ts`).
 */

/** Hard no-text block — repeat before and after the scene. */
export const FLUX_NO_TEXT_BLOCK = [
  "CRITICAL: the image must contain ZERO text of any kind",
  "no letters, no alphabet characters, no words, no writing, no typography, no calligraphy",
  "no numbers, no digits, no numerals, no math symbols",
  "no signs, no posters, no labels, no captions, no titles, no subtitles",
  "no speech bubbles, no thought bubbles, no comics lettering",
  "no book pages with writing, no notebooks with writing, no chalkboards with writing",
  "no logos, no watermarks, no brand marks, no UI, no menus",
  "blank empty surfaces only — skies, walls, ground, clothing without symbols",
  "do not render any readable or unreadable glyphs",
].join(". ");

/** Default style lock so social posts stay illustrated, not stock-photo. */
export const FLUX_ILLUSTRATION_STYLE_LOCK =
  "Children's brand illustration, warm soft lighting, soft gradients, clear shapes, friendly pictorial artwork, high detail, clean edges, illustrated not photographic, not photorealistic, not a stock photo, not CGI realism, not pixelated, not low-res";

/** Compact no-text guard for social (style stays primary; typography is composited). */
export const FLUX_SOCIAL_NO_TEXT =
  "No readable text, letters, numbers, signs, logos, watermarks, or UI anywhere in the image.";

/**
 * Strips digits and quote marks that FLUX tends to paint as glyphs.
 */
export function sanitizeFluxVisualCue(text: string, maxLen = 280): string {
  return text
    .replace(/[0-9]+/g, " ")
    .replace(/[„“”"«»'’']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Day-of-month mood without putting calendar digits in the prompt. */
export function fluxDayVisualVariation(postDate: string): string {
  const day = Number(postDate.slice(-2));
  if (!Number.isFinite(day) || day < 1) {
    return "Soft natural light, cozy reading atmosphere.";
  }
  const cues = [
    "Soft morning window light, calm indoor reading nook.",
    "Golden afternoon outdoor park vibes, gentle breeze.",
    "Cozy evening lamp glow, warm blankets and books.",
    "Bright playful daytime energy, colorful and lively.",
    "Quiet rainy-day indoors, soft muted colors.",
    "Sunny balcony or garden reading moment.",
    "Library-corner mood with shelves as soft shapes only (no titles).",
    "Adventure outdoor path, curious explorers with a book.",
  ];
  return cues[(day - 1) % cues.length]!;
}
