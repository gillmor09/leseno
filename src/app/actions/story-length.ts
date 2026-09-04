"use server";

import { revalidatePath } from "next/cache";

import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import type { ActionResult } from "@/lib/types/actions";
import { updateStoryLengthLimits } from "@/lib/stories/length-repository";
import { storyLengthLimitsFormSchema } from "@/lib/validations/story-length";

/**
 * Saves word-count bands from the admin form. Admin role required.
 */
export async function saveStoryLengthLimitsAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

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
    revalidatePath("/basis");
    revalidatePath("/admin/textlaenge");
    revalidatePath("/admin/prompts");
    return { success: true };
  } catch (error) {
    console.error("[saveStoryLengthLimitsAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt. Ist Supabase erreichbar?",
    };
  }
}
