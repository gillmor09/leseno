/**
 * Page gates by Auth `app_metadata.role` (1:1 role → membership story page).
 * Admin may open every membership page for support.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isMembershipRoleId,
  storyPathForRole,
  type MembershipRoleId,
} from "@/lib/users/catalog";

/**
 * Requires a signed-in user whose role matches `requiredRole` (or admin).
 * Guests → anmelden; wrong package → their own story page or home.
 */
export async function requireMembershipPage(
  requiredRole: MembershipRoleId,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=/${requiredRole}`);
  }

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : "";

  if (role === "admin") {
    return;
  }

  if (role === requiredRole) {
    return;
  }

  if (isMembershipRoleId(role)) {
    redirect(storyPathForRole(role));
  }

  redirect("/");
}
