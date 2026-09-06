"use server";

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import type { ActionResult } from "@/lib/types/actions";
import { normalizeReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import { emptyReadingTypographyCatalog } from "@/lib/stories/reading-typography-defaults";
import { upsertReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { readingTypographyDefaultsFormSchema } from "@/lib/validations/reading-typography";
import type { StorySchoolStageId } from "@/lib/stories/options";

/**
 * Saves admin typography defaults per school stage.
 */
export async function saveReadingTypographyDefaultsAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = readingTypographyDefaultsFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const catalog = emptyReadingTypographyCatalog();
    for (const row of parsed.data.defaults) {
      catalog[row.schoolStage as StorySchoolStageId] = normalizeReadingModePrefs(
        row.prefs,
      );
    }
    await upsertReadingTypographyDefaults(
      catalog as ReadingTypographyDefaultsCatalog,
    );
    revalidatePath("/admin/schrifteinstellung");
    revalidatePath("/geschichte");
    revalidatePath("/meine-buecherei");
    revalidatePath("/meine-welt");
    revalidatePath("/kostenlos");
    return { success: true };
  } catch (error) {
    console.error("[saveReadingTypographyDefaultsAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt. Ist Supabase erreichbar?",
    };
  }
}
