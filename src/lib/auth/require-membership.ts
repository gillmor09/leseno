/**
 * Page gates for the shared membership story composer (`/geschichte`).
 * Any membership role or admin may open it; guests → anmelden.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isMembershipRoleId,
  STORY_PATH,
} from "@/lib/users/catalog";

/**
 * Requires a signed-in user with a membership role (or admin).
 * Returns the Auth role string for package feature resolution.
 * @param nextPath Login redirect target (default: story composer).
 */
export async function requireAnyMembershipPage(
  nextPath: string = STORY_PATH,
): Promise<{ role: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=${encodeURIComponent(nextPath)}`);
  }

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : "";

  if (role === "admin" || isMembershipRoleId(role)) {
    return { role };
  }

  redirect("/");
}
