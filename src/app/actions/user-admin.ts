"use server";

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listPackageBookingsForUser,
  listPromoRedemptionsForUser,
  type UserPromoRedemption,
} from "@/lib/users/billing";
import {
  deleteUserForAdmin,
  updateUsersForAdmin,
} from "@/lib/users/repository";
import type { UserPackageBooking } from "@/lib/users/packages";
import type { ActionResult } from "@/lib/types/actions";
import {
  deleteUserAdminSchema,
  userAdminFormSchema,
} from "@/lib/validations/user-admin";
import { z } from "zod";
import "@/lib/validations/configure-zod";

/**
 * Saves admin changes for user email and role assignments. Admin role required.
 * Role changes also write package booking history; admin users get 0 credits.
 */
export async function saveUsersAdminAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

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

/**
 * Deletes a user from Supabase Auth (and cascaded app data). Admin only.
 * The signed-in admin cannot delete their own account.
 */
export async function deleteUserAdminAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = deleteUserAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige User-ID.",
    };
  }

  const current = await getCurrentUser();
  if (current?.id === parsed.data.userId) {
    return {
      success: false,
      error: "Du kannst dein eigenes Admin-Konto nicht löschen.",
    };
  }

  try {
    await deleteUserForAdmin(parsed.data.userId);
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("[deleteUserAdminAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Löschen hat nicht geklappt.",
    };
  }
}

const historySchema = z.object({
  userId: z.string().uuid("Ungültige User-ID."),
});

/**
 * Package bookings + promo redemptions for one user (admin history dialog).
 */
export async function getUserBillingHistoryAction(
  input: unknown,
): Promise<
  ActionResult<{
    bookings: UserPackageBooking[];
    promos: UserPromoRedemption[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = historySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige User-ID.",
    };
  }

  try {
    const [bookings, promos] = await Promise.all([
      listPackageBookingsForUser(parsed.data.userId),
      listPromoRedemptionsForUser(parsed.data.userId).catch((error) => {
        console.warn("[getUserBillingHistoryAction] promos", error);
        return [] as UserPromoRedemption[];
      }),
    ]);
    return { success: true, data: { bookings, promos } };
  } catch (error) {
    console.error("[getUserBillingHistoryAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verlauf konnte nicht geladen werden.",
    };
  }
}
