/**
 * Admin authorization helpers for pages and Server Actions.
 * Role: Supabase Auth `app_metadata.role === "admin"`.
 */

import { redirect } from "next/navigation";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/auth/session";

export const ADMIN_FORBIDDEN_MESSAGE =
  "Dazu brauchst du Admin-Rechte. Bitte melde dich mit einem Admin-Konto an.";

/**
 * Redirects non-admins away from `/admin/*` (unsigned → anmelden, others → home).
 */
export async function requireAdminPage(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/admin/users");
  }
  if (user.app_metadata?.role !== "admin") {
    redirect("/");
  }
}

/**
 * Returns a German ActionResult error when the caller is not an admin.
 * Otherwise returns null and the action may proceed.
 */
export async function denyUnlessAdmin(): Promise<string | null> {
  if (await isCurrentUserAdmin()) {
    return null;
  }
  return ADMIN_FORBIDDEN_MESSAGE;
}
