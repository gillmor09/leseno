import { headers } from "next/headers";
import { LandingHeader } from "@/components/features/landing/landing-header";
import { LandingMarketingHeader } from "@/components/features/landing/landing-marketing-header";
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
 * Server wrapper: zero-JS marketing header when signed out; client chrome when signed in
 * (Bücherei / Geschichte / Meine Welt / Abmelden + optional admin cog).
 */
export async function AppHeader() {
  const user = await getCurrentUser();
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  if (!user) {
    return (
      <LandingMarketingHeader
        registerActive={pathname === "/registrieren"}
        signInActive={
          pathname === "/anmelden" ||
          pathname === "/passwort-vergessen" ||
          pathname === "/passwort-zuruecksetzen" ||
          pathname === "/email-vergessen"
        }
      />
    );
  }

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : undefined;
  const isAdmin = role === "admin";
  const adminImpersonating = isAdminImpersonating(
    user.app_metadata as Record<string, unknown> | undefined,
  );
  const testRole: MembershipRoleId | null =
    adminImpersonating && role && isMembershipRoleId(role) ? role : null;

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  const showMeineWelt = featuresInclude(features, "meine_welt");
  const showMeineBuecherei = featuresInclude(features, "buecherei");

  return (
    <LandingHeader
      isAdmin={Boolean(isAdmin)}
      adminImpersonating={adminImpersonating}
      testRole={testRole}
      isSignedIn
      storyHref={storyPathForRole(role)}
      showMeineWelt={showMeineWelt}
      showMeineBuecherei={showMeineBuecherei}
    />
  );
}
