/**
 * Canonical cover pixel size after generate/overlay/compress (5:8).
 * 1600×2560 @ 300 ppi ≈ 5.33×8.53 in — print-ready portrait.
 * IONOS FLUX generates at most 1280×2048 (API max edge 2048); we upscale here.
 * Kept client-safe — do not import canvas / Node overlay code here.
 */
export const ROMAN_COVER_PPI = 300;

export const ROMAN_COVER_SIZE = { width: 1600, height: 2560 } as const;

/** Largest 5:8 IONOS FLUX size under the 2048 px edge limit. */
export const ROMAN_COVER_IONOS_GENERATE_SIZE = {
  width: 1280,
  height: 2048,
} as const;

/** Short label for UI / prompts, e.g. `1600×2560 @ 300 ppi`. */
export function romanCoverSizeLabel(): string {
  return `${ROMAN_COVER_SIZE.width}×${ROMAN_COVER_SIZE.height} @ ${ROMAN_COVER_PPI} ppi`;
}
