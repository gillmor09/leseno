"use server";

import { revalidatePath } from "next/cache";
import { updateUsersForAdmin } from "@/lib/users/repository";
import type { ActionResult } from "@/lib/types/actions";
import { userAdminFormSchema } from "@/lib/validations/user-admin";

/**
 * Saves admin changes for user email and role assignments.
 */
export async function saveUsersAdminAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = userAdminFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Die User-Angaben sind ungültig.",
    };
  }

  try {
    await updateUsersForAdmin(parsed.data.users);
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern hat nicht geklappt.";
    if (message.toLowerCase().includes("duplicate")) {
      return {
        success: false,
        error: "Diese E-Mail-Adresse ist bereits vergeben.",
      };
    }
    return { success: false, error: message };
  }
}
