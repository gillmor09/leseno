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
  const lengthCatalog = await loadStoryLengthCatalog();
  const access = await loadPackageAccessForCurrentUser();
  const packageLabel = access?.label ?? "Basis";
  const enabledFeatures = access?.features ?? [];
  const allowMeineWelt = featuresInclude(enabledFeatures, "meine_welt");
  const childProfiles = allowMeineWelt
    ? await loadChildProfileOptionsForUser(true)
    : null;

  let initialCredits = 0;
  try {
    initialCredits = await loadMyCredits();
  } catch (error) {
    console.error("[MembershipStoryPage] credits", error);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <GeschichteComposer
            packageLabel={packageLabel}
            initialCredits={initialCredits}
            creditsCheckoutEnabled={hasStripeCheckoutConfig()}
            allowMeineWelt={allowMeineWelt}
            lengthCatalog={lengthCatalog}
            childProfiles={childProfiles}
            enabledFeatures={enabledFeatures}
            inviteUserId={user?.id ?? null}
          />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
