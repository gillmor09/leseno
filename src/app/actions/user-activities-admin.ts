"use server";

/**
 * Admin actions for user activity log (delete by date cutoff).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { deleteActivitiesBeforeAdmin } from "@/lib/users/activity";
import type { ActionResult } from "@/lib/types/actions";
import { z } from "zod";
import "@/lib/validations/configure-zod";

const deleteBeforeSchema = z.object({
  /** Local calendar date `YYYY-MM-DD` — deletes everything strictly before 00:00 that day (local). */
  beforeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Bitte ein gültiges Datum wählen." }),
});

/**
 * Deletes activities older than the start of `beforeDate` (local midnight).
 */
export async function deleteActivitiesBeforeAction(
  input: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = deleteBeforeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datum ungültig.",
    };
  }

  const localMidnight = new Date(`${parsed.data.beforeDate}T00:00:00`);
  if (Number.isNaN(localMidnight.getTime())) {
    return { success: false, error: "Datum ungültig." };
  }

  try {
    const deleted = await deleteActivitiesBeforeAdmin(
      localMidnight.toISOString(),
    );
    revalidatePath("/admin/aktivitaeten");
    return { success: true, data: { deleted } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Löschen hat nicht geklappt.";
    return { success: false, error: message };
  }
}
