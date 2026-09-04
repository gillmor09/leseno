import { LandingHeader } from "@/components/features/landing/landing-header";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Server wrapper: admin cog for admins; Meine Welt / Abmelden when signed in.
 */
export async function AppHeader() {
  const user = await getCurrentUser();
  const isAdmin = user?.app_metadata?.role === "admin";
  return (
    <LandingHeader isAdmin={Boolean(isAdmin)} isSignedIn={Boolean(user)} />
  );
}
