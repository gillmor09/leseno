/**
 * Client + profile prefs for Lesemodus typography (localStorage fallback / child_profiles JSON).
 * Empty profile JSON / missing keys means “follow admin stage Standard”.
 */

export type ReadingModePrefs = {
  /** Relative font scale (1 = default). */
  fontScale: number;
  /** Unitless line-height. */
  lineHeight: number;
  /** Letter-spacing in em. */
  letterSpacingEm: number;
  /** CSS font-weight (400–800). */
  fontWeight: number;
  /** Reading column max-width in rem (the story card width). */
  contentMaxWidthRem: number;
};

export const READING_MODE_STORAGE_KEY = "leseno_reading_mode_prefs";

/** Legacy global fallback when no stage catalog is available. */
export const READING_MODE_DEFAULTS: ReadingModePrefs = {
  fontScale: 1.15,
  lineHeight: 1.75,
  letterSpacingEm: 0.01,
  fontWeight: 600,
  contentMaxWidthRem: 48,
};

export const READING_MODE_FONT_STEPS = [0.95, 1.05, 1.15, 1.3, 1.45, 1.65] as const;
export const READING_MODE_LINE_STEPS = [1.4, 1.55, 1.75, 1.95, 2.15] as const;
export const READING_MODE_LETTER_STEPS = [0, 0.01, 0.03, 0.05, 0.08] as const;
export const READING_MODE_WEIGHT_STEPS = [400, 500, 600, 700, 800] as const;
/** Rem max-widths: ~xl → ~5xl. */
export const READING_MODE_WIDTH_STEPS = [36, 42, 48, 56, 64] as const;

const WEIGHT_LABELS: Record<number, string> = {
  400: "Dünn",
  500: "Normal",
  600: "Mittel",
  700: "Fett",
  800: "Extra",
};

const WIDTH_LABELS: Record<number, string> = {
  36: "Schmal",
  42: "Eng",
  48: "Normal",
  56: "Breit",
  64: "Sehr breit",
};

export function readingModeWeightLabel(weight: number): string {
  return WEIGHT_LABELS[weight] ?? String(weight);
}

export function readingModeWidthLabel(widthRem: number): string {
  return WIDTH_LABELS[widthRem] ?? `${widthRem} rem`;
}

function clampToStep(value: number, steps: readonly number[]): number {
  let best = steps[0] ?? value;
  let bestDist = Math.abs(best - value);
  for (const step of steps) {
    const dist = Math.abs(step - value);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * True when stored prefs are a custom override (non-empty object).
 * Empty `{}` / null / missing → follow admin stage Standard.
 */
export function hasCustomReadingModePrefs(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

/**
 * Normalizes partial JSON into a full prefs object.
 * `fallback` is used for missing fields (stage Standard or legacy default).
 */
export function normalizeReadingModePrefs(
  raw: unknown,
  fallback: ReadingModePrefs = READING_MODE_DEFAULTS,
): ReadingModePrefs {
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<ReadingModePrefs>)
      : {};

  return {
    fontScale: clampToStep(
      Number(parsed.fontScale) || fallback.fontScale,
      READING_MODE_FONT_STEPS,
    ),
    lineHeight: clampToStep(
      Number(parsed.lineHeight) || fallback.lineHeight,
      READING_MODE_LINE_STEPS,
    ),
    letterSpacingEm: clampToStep(
      Number.isFinite(Number(parsed.letterSpacingEm))
        ? Number(parsed.letterSpacingEm)
        : fallback.letterSpacingEm,
      READING_MODE_LETTER_STEPS,
    ),
    fontWeight: clampToStep(
      Number(parsed.fontWeight) || fallback.fontWeight,
      READING_MODE_WEIGHT_STEPS,
    ),
    contentMaxWidthRem: clampToStep(
      Number(parsed.contentMaxWidthRem) || fallback.contentMaxWidthRem,
      READING_MODE_WIDTH_STEPS,
    ),
  };
}

/**
 * Resolves effective Lesemodus prefs: custom override or stage Standard.
 */
export function resolveReadingModePrefs(input: {
  stored: unknown;
  stageDefaults: ReadingModePrefs;
}): ReadingModePrefs {
  if (!hasCustomReadingModePrefs(input.stored)) {
    return normalizeReadingModePrefs(input.stageDefaults);
  }
  return normalizeReadingModePrefs(input.stored, input.stageDefaults);
}

function storageKeyForProfile(profileId: string | null | undefined): string {
  if (profileId) return `${READING_MODE_STORAGE_KEY}:${profileId}`;
  return READING_MODE_STORAGE_KEY;
}

/**
 * Loads custom reading prefs from localStorage, or null when following Standard.
 */
export function loadStoredReadingModePrefs(
  profileId?: string | null,
): ReadingModePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKeyForProfile(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!hasCustomReadingModePrefs(parsed)) return null;
    return normalizeReadingModePrefs(parsed);
  } catch {
    return null;
  }
}

/** @deprecated Prefer loadStoredReadingModePrefs + stage defaults. */
export function loadReadingModePrefs(
  profileId?: string | null,
): ReadingModePrefs {
  return loadStoredReadingModePrefs(profileId) ?? { ...READING_MODE_DEFAULTS };
}

export function saveReadingModePrefs(
  prefs: ReadingModePrefs,
  profileId?: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKeyForProfile(profileId),
      JSON.stringify(prefs),
    );
  } catch {
    // private mode / quota
  }
}

/** Clears custom override so Lesemodus follows admin stage Standard again. */
export function clearReadingModePrefs(profileId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKeyForProfile(profileId));
  } catch {
    // private mode / quota
  }
}

export function stepIndex(value: number, steps: readonly number[]): number {
  const clamped = clampToStep(value, steps);
  const index = steps.indexOf(clamped as (typeof steps)[number]);
  return index >= 0 ? index : 0;
}

export function nudgeStep(
  value: number,
  steps: readonly number[],
  delta: -1 | 1,
): number {
  const index = stepIndex(value, steps);
  const next = Math.min(steps.length - 1, Math.max(0, index + delta));
  return steps[next] ?? value;
}
