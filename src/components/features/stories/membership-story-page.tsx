/**
 * Shared shell for the gated membership composer (`/geschichte`).
 * Package label + feature flags come from `membership_packages`.
 */

import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { GeschichteComposer } from "@/components/features/stories/geschichte-composer";
import { getCurrentUser } from "@/lib/auth/session";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { loadChildProfileOptionsForUser } from "@/lib/world/story-options";

/**
 * Auth + membership gate, then composer UI with package-driven features.
 */
export async function MembershipStoryPage() {
  await requireAnyMembershipPage();

  const user = await getCurrentUser();
  const [lengthCatalog, typographyDefaults] = await Promise.all([
    loadStoryLengthCatalog(),
    loadReadingTypographyDefaults(),
  ]);
  const access = await loadPackageAccessForCurrentUser();
  const packageLabel = access?.label ?? "Basis";
  const enabledFeatures = access?.features ?? [];
  const allowMeineWelt = featuresInclude(enabledFeatures, "meine_welt");
  const childProfiles = allowMeineWelt
    ? await loadChildProfileOptionsForUser(true)
    : null;

  let unlockedProfileIds: string[] = [];
  if (user?.id && childProfiles && childProfiles.length > 0) {
    try {
      const { listUnlockedChildProfileIds } = await import(
        "@/lib/world/profile-pin-access"
      );
      unlockedProfileIds = await listUnlockedChildProfileIds(
        user.id,
        childProfiles,
      );
    } catch (error) {
      console.warn("[MembershipStoryPage] profile unlock", error);
    }
  }

  let initialCredits = 0;
  try {
    initialCredits = await loadMyCredits();
  } catch (error) {
    console.error("[MembershipStoryPage] credits", error);
  }

  // Catch-up: grant any paid months missed while the app was unused.
  if (user?.id && hasStripeCheckoutConfig()) {
    try {
      const { reconcileSubscriptionCreditGrants } = await import(
        "@/lib/stripe/credit-grants"
      );
      const { loadMyCredits: reloadCredits } = await import(
        "@/lib/users/billing"
      );
      const catchUp = await reconcileSubscriptionCreditGrants(user.id);
      if (catchUp.creditsGranted > 0) {
        initialCredits = await reloadCredits();
      }
    } catch (error) {
      console.warn("[MembershipStoryPage] credit catch-up", error);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <GeschichteComposer
            packageLabel={packageLabel}
            initialCredits={initialCredits}
            creditsCheckoutEnabled={hasStripeCheckoutConfig()}
            allowMeineWelt={allowMeineWelt}
            lengthCatalog={lengthCatalog}
            typographyDefaults={typographyDefaults}
            childProfiles={childProfiles}
            unlockedProfileIds={unlockedProfileIds}
            enabledFeatures={enabledFeatures}
            inviteUserId={user?.id ?? null}
          />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
