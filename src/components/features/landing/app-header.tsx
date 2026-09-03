import { LandingHeader } from "@/components/features/landing/landing-header";
import { isCurrentUserAdmin } from "@/lib/auth/session";

/**
 * Server wrapper so the cog / admin overlay only renders for signed-in admins.
 */
export async function AppHeader() {
  const isAdmin = await isCurrentUserAdmin();
  return <LandingHeader isAdmin={isAdmin} />;
}
