/**
 * Loads / saves admin typography defaults per school stage.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  emptyReadingTypographyCatalog,
  FALLBACK_READING_TYPOGRAPHY_DEFAULTS,
  type ReadingTypographyDefaultsCatalog,
} from "@/lib/stories/reading-typography-defaults";
import { normalizeReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import type { StorySchoolStageId } from "@/lib/stories/options";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";

type Row = {
  school_stage: string;
  font_scale: number;
  line_height: number;
  letter_spacing_em: number;
  font_weight: number;
  content_max_width_rem: number;
};

const STAGE_IDS = new Set(
  STORY_SCHOOL_STAGES.map((stage) => stage.id),
);

function mapCatalog(rows: Row[]): ReadingTypographyDefaultsCatalog {
  const catalog = emptyReadingTypographyCatalog();
  for (const row of rows) {
    if (!STAGE_IDS.has(row.school_stage as StorySchoolStageId)) continue;
    catalog[row.school_stage as StorySchoolStageId] = normalizeReadingModePrefs({
      fontScale: Number(row.font_scale),
      lineHeight: Number(row.line_height),
      letterSpacingEm: Number(row.letter_spacing_em),
      fontWeight: Number(row.font_weight),
      contentMaxWidthRem: Number(row.content_max_width_rem),
    });
  }
  return catalog;
}

/** Public catalog for story UI. Falls back to seed when RPC fails. */
export async function loadReadingTypographyDefaults(): Promise<ReadingTypographyDefaultsCatalog> {
  try {
    const supabase = await createClient(null);
    const { data, error } = await supabase.rpc(
      "list_reading_typography_defaults",
    );
    if (error || !data?.length) {
      return { ...FALLBACK_READING_TYPOGRAPHY_DEFAULTS };
    }
    return mapCatalog(data as Row[]);
  } catch {
    return { ...FALLBACK_READING_TYPOGRAPHY_DEFAULTS };
  }
}

/** Admin load via service role. */
export async function loadReadingTypographyDefaultsForAdmin(): Promise<ReadingTypographyDefaultsCatalog> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "list_reading_typography_defaults",
  );
  if (error) throw new Error(error.message);
  if (!data?.length) return { ...FALLBACK_READING_TYPOGRAPHY_DEFAULTS };
  return mapCatalog(data as Row[]);
}

export async function upsertReadingTypographyDefaults(
  catalog: ReadingTypographyDefaultsCatalog,
): Promise<void> {
  const supabase = createServiceClient(null);

  for (const stage of STORY_SCHOOL_STAGES) {
    const prefs = normalizeReadingModePrefs(catalog[stage.id]);
    const { error } = await supabase.rpc("upsert_reading_typography_default", {
      p_school_stage: stage.id,
      p_font_scale: prefs.fontScale,
      p_line_height: prefs.lineHeight,
      p_letter_spacing_em: prefs.letterSpacingEm,
      p_font_weight: prefs.fontWeight,
      p_content_max_width_rem: prefs.contentMaxWidthRem,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
}
