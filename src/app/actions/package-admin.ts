"use server";

import { revalidatePath } from "next/cache";

import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { updateMembershipPackages } from "@/lib/users/package-repository";
import type { ActionResult } from "@/lib/types/actions";
import { membershipPackagesFormSchema } from "@/lib/validations/package-admin";

/**
 * Saves membership package catalog (label, price, credits, features). Admin only.
 */
export async function saveMembershipPackagesAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = membershipPackagesFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      error: first?.message ?? "Die Paket-Angaben sind ungültig.",
    };
  }

  try {
    await updateMembershipPackages(parsed.data.packages);
    revalidatePath("/admin/pakete");
    revalidatePath("/preise");
    revalidatePath("/geschichte");
    revalidatePath("/meine-welt");
    return { success: true };
  } catch (error) {
    console.error("[saveMembershipPackagesAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt. Ist die Migration `membership_packages` ausgeführt?",
    };
  }
}
