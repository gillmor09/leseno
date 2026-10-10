/**
 * Canonical cover pixel size (2:3).
 * GPT Image 2.5 generates this natively — no post-upscale.
 * 1600×2400 @ 300 ppi ≈ 5.33×8 in — common eBook / KDP portrait.
 * Kept client-safe — do not import canvas / Node overlay code here.
 */
export const ROMAN_COVER_PPI = 300;

export const ROMAN_COVER_SIZE = { width: 1600, height: 2400 } as const;

/** Exact OpenAI / API size string for native cover generation. */
export const ROMAN_COVER_GENERATE_SIZE = `${ROMAN_COVER_SIZE.width}x${ROMAN_COVER_SIZE.height}`;

/**
 * @deprecated Prefer {@link ROMAN_COVER_GENERATE_SIZE} (native 1600×2400).
 * Kept for any IONOS fallback under the 2048 px edge limit.
 */
export const ROMAN_COVER_IONOS_GENERATE_SIZE = {
  width: 1280,
  height: 1920,
} as const;

/** Short label for UI / prompts, e.g. `1600×2400 @ 300 ppi`. */
export function romanCoverSizeLabel(): string {
  return `${ROMAN_COVER_SIZE.width}×${ROMAN_COVER_SIZE.height} @ ${ROMAN_COVER_PPI} ppi`;
}
