/**
 * Admin authorization helpers for pages and Server Actions.
 * Role: Supabase Auth `app_metadata.role === "admin"`.
 * While `admin_impersonation` is set, the JWT role is a membership role —
 * Admin-Seiten/Actions sind dann gesperrt; Wiederherstellung über Zahnrad.
 */

import { redirect } from "next/navigation";
import { isAdminImpersonating } from "@/lib/auth/admin-impersonation";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/auth/session";

export const ADMIN_FORBIDDEN_MESSAGE =
  "Dazu brauchst du Admin-Rechte. Bitte melde dich mit einem Admin-Konto an.";

export const ADMIN_IMPERSONATION_FORBIDDEN_MESSAGE =
  "Du bist im Rollen-Testmodus — Admin-Aktionen sind gesperrt. Zahnrad → „Zurück zu Admin“.";

/**
 * Redirects non-admins away from `/admin/*` (unsigned → anmelden, others → home).
 * Impersonating admins stay on member routes until they restore admin.
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
  const user = await getCurrentUser();
  if (
    user &&
    isAdminImpersonating(user.app_metadata as Record<string, unknown>)
  ) {
    return ADMIN_IMPERSONATION_FORBIDDEN_MESSAGE;
  }
  return ADMIN_FORBIDDEN_MESSAGE;
}
