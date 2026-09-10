import { headers } from "next/headers";
import { LandingHeader } from "@/components/features/landing/landing-header";
import { LandingMarketingHeader } from "@/components/features/landing/landing-marketing-header";
import { isAdminImpersonating } from "@/lib/auth/admin-impersonation";
import { getAppSession } from "@/lib/auth/app-session";
import {
  isMembershipRoleId,
  storyPathForRole,
  type MembershipRoleId,
} from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";

/**
 * Server wrapper: marketing header when signed out; member chrome when signed in
 * (Bücherei / Geschichte / Meine Welt / Buchclub / Abmelden + optional admin cog).
 * Child sessions get member chrome without Meine Welt / Buchclub / admin.
 */
export async function AppHeader() {
  const session = await getAppSession();
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  if (!session) {
    return (
      <LandingMarketingHeader
        registerActive={pathname === "/registrieren"}
        signInActive={
          pathname === "/anmelden" ||
          pathname === "/passwort-vergessen" ||
          pathname === "/passwort-zuruecksetzen"
        }
      />
    );
  }

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  const isChild = session.kind === "child";

  if (isChild) {
    return (
      <LandingHeader
        isSignedIn
        storyHref="/geschichte"
        showMeineWelt={false}
        showMeineBuecherei={false}
        showMeinBuchclub={false}
      />
    );
  }

  const user = session.user;
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

  const showMeineWelt = featuresInclude(features, "meine_welt");
  const showMeineBuecherei = featuresInclude(features, "buecherei");
  const showMeinBuchclub = featuresInclude(features, "buchclub");

  return (
    <LandingHeader
      isAdmin={Boolean(isAdmin)}
      adminImpersonating={adminImpersonating}
      testRole={testRole}
      isSignedIn
      storyHref={storyPathForRole(role)}
      showMeineWelt={showMeineWelt}
      showMeineBuecherei={showMeineBuecherei}
      showMeinBuchclub={showMeinBuchclub}
    />
  );
}
