import { LandingHeader } from "@/components/features/landing/landing-header";
import { isAdminImpersonating } from "@/lib/auth/admin-impersonation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isMembershipRoleId,
  storyPathForRole,
  type MembershipRoleId,
} from "@/lib/users/catalog";

/**
 * Server wrapper: admin cog for admins; Meine Welt / story page / Abmelden when signed in.
 * While an admin tests a membership role, the cog stays for restore / role switch.
 */
export async function AppHeader() {
  const user = await getCurrentUser();
  const role =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role
      : undefined;
  const isAdmin = role === "admin";
  const adminImpersonating = isAdminImpersonating(
    user?.app_metadata as Record<string, unknown> | undefined,
  );
  const testRole: MembershipRoleId | null =
    adminImpersonating && role && isMembershipRoleId(role) ? role : null;

  return (
    <LandingHeader
      isAdmin={Boolean(isAdmin)}
      adminImpersonating={adminImpersonating}
      testRole={testRole}
      isSignedIn={Boolean(user)}
      storyHref={storyPathForRole(role)}
    />
  );
}
