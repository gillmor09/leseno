"use server";

/**
 * Admin actions for contact-form inbox.
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { deleteContactRequestForAdmin } from "@/lib/contact/repository";
import type { ActionResult } from "@/lib/types/actions";
import { z } from "zod";
import "@/lib/validations/configure-zod";

const deleteSchema = z.object({
  id: z.string().uuid("Ungültige Anfrage-ID."),
});

/**
 * Deletes one contact request. Admin only.
 */
export async function deleteContactRequestAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const deleted = await deleteContactRequestForAdmin(parsed.data.id);
    if (!deleted) {
      return { success: false, error: "Anfrage nicht gefunden." };
    }
    revalidatePath("/admin/kontakt");
    return { success: true };
  } catch (error) {
    console.error("[deleteContactRequestAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Löschen hat nicht geklappt.",
    };
  }
}
