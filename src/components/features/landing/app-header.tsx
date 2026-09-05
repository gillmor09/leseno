import { LandingHeader } from "@/components/features/landing/landing-header";
import { isAdminImpersonating } from "@/lib/auth/admin-impersonation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isMembershipRoleId,
  storyPathForRole,
  type MembershipRoleId,
} from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";

/**
 * Server wrapper: admin cog; Bücherei / Geschichte / Meine Welt / Abmelden when signed in.
 * Nav links for Bücherei and Meine Welt follow package features.
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

  const access = user ? await loadPackageAccessForCurrentUser() : null;
  const features = access?.features ?? [];
  const showMeineWelt = featuresInclude(features, "meine_welt");
  const showMeineBuecherei = featuresInclude(features, "buecherei");

  return (
    <LandingHeader
      isAdmin={Boolean(isAdmin)}
      adminImpersonating={adminImpersonating}
      testRole={testRole}
      isSignedIn={Boolean(user)}
      storyHref={storyPathForRole(role)}
      showMeineWelt={showMeineWelt}
      showMeineBuecherei={showMeineBuecherei}
    />
  );
}
