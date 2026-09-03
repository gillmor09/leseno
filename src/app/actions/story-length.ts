"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/types/actions";
import { updateStoryLengthLimits } from "@/lib/stories/length-repository";
import { storyLengthLimitsFormSchema } from "@/lib/validations/story-length";

/**
 * Saves word-count bands from the admin form.
 * Auth/session gate comes later; writes already go through the service role.
 */
export async function saveStoryLengthLimitsAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = storyLengthLimitsFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      error: first?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    await updateStoryLengthLimits(parsed.data.limits);
    revalidatePath("/kostenlos");
    revalidatePath("/admin/textlaenge");
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Speichern hat nicht geklappt. Ist Supabase erreichbar?",
    };
  }
}
