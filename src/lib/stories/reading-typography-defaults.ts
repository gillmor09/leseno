/**
 * Admin-managed typography defaults per school stage (story card + Lesemodus start).
 * Profile / localStorage overrides only apply in Lesemodus until reset to Standard.
 */

import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import { READING_MODE_DEFAULTS } from "@/lib/stories/reading-mode-prefs";
import {
  STORY_SCHOOL_STAGES,
  type StorySchoolStageId,
} from "@/lib/stories/options";

export type ReadingTypographyDefaultsCatalog = Record<
  StorySchoolStageId,
  ReadingModePrefs
>;

/** Hardcoded fallback when DB / RPC is unavailable (mirrors migration seed). */
export const FALLBACK_READING_TYPOGRAPHY_DEFAULTS: ReadingTypographyDefaultsCatalog =
  {
    vorschule: {
      fontScale: 1.45,
      lineHeight: 1.95,
      letterSpacingEm: 0.03,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
    klasse_1: {
      fontScale: 1.3,
      lineHeight: 1.95,
      letterSpacingEm: 0.03,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
    klasse_2: {
      fontScale: 1.3,
      lineHeight: 1.75,
      letterSpacingEm: 0.01,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
    klasse_3: {
      fontScale: 1.15,
      lineHeight: 1.75,
      letterSpacingEm: 0.01,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
    klasse_4: {
      fontScale: 1.15,
      lineHeight: 1.75,
      letterSpacingEm: 0.01,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
    hoeher: {
      fontScale: 1.05,
      lineHeight: 1.75,
      letterSpacingEm: 0,
      fontWeight: 600,
      contentMaxWidthRem: 48,
    },
  };

/**
 * Returns stage defaults, falling back to hardcoded seed for missing stages.
 */
export function typographyDefaultsForStage(
  catalog: ReadingTypographyDefaultsCatalog | null | undefined,
  stage: StorySchoolStageId,
): ReadingModePrefs {
  return (
    catalog?.[stage] ??
    FALLBACK_READING_TYPOGRAPHY_DEFAULTS[stage] ??
    READING_MODE_DEFAULTS
  );
}

export function emptyReadingTypographyCatalog(): ReadingTypographyDefaultsCatalog {
  return { ...FALLBACK_READING_TYPOGRAPHY_DEFAULTS };
}

export function allSchoolStages(): readonly StorySchoolStageId[] {
  return STORY_SCHOOL_STAGES.map((stage) => stage.id);
}
