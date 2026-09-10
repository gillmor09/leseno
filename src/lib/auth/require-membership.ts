/**
 * Page gates for the shared membership story composer (`/geschichte`).
 * Any membership role or admin may open it; guests → anmelden.
 */

import { redirect } from "next/navigation";
import { isMembershipRoleId, STORY_PATH } from "@/lib/users/catalog";

/**
 * Requires a signed-in parent or child session with a membership role (or admin).
 * Returns the Auth role string for package feature resolution.
 * @param nextPath Login redirect target (default: story composer).
 */
export async function requireAnyMembershipPage(
  nextPath: string = STORY_PATH,
): Promise<{ role: string }> {
  const { getAppSession, getSessionMembershipRole } = await import(
    "@/lib/auth/app-session"
  );
  const session = await getAppSession();
  if (!session) {
    redirect(`/anmelden?next=${encodeURIComponent(nextPath)}`);
  }

  const role = await getSessionMembershipRole();

  if (role === "admin" || isMembershipRoleId(role)) {
    return { role };
  }

  redirect("/");
}
