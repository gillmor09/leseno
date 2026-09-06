import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MembershipCreditsHeader } from "@/components/features/membership/membership-credits-header";
import { MyWorldManager } from "@/components/features/world/my-world-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { STORY_PATH } from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { listMyChildProfiles } from "@/lib/world/repository";

export const metadata: Metadata = {
  title: "Meine Welt — Leseno",
  description:
    "Verwalte Profile für eure Kinder: Namen, Freunde, Interessen und Wünsche.",
};

/**
 * Signed-in personal hub for one or more child profiles.
 * Requires package feature `meine_welt`; family add-ons need `meine_welt_familie`.
 */
export default async function MeineWeltPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/meine-welt");
  }

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  if (!featuresInclude(features, "meine_welt")) {
    redirect(STORY_PATH);
  }

  const allowFamily = featuresInclude(features, "meine_welt_familie");
  const typographyDefaults = await loadReadingTypographyDefaults();

  let initialCredits = 0;
  try {
    initialCredits = await loadMyCredits();
  } catch (error) {
    console.error("[MeineWeltPage] credits", error);
  }

  let profiles: Awaited<ReturnType<typeof listMyChildProfiles>> = [];
  let loadError: string | null = null;

  try {
    profiles = await listMyChildProfiles();
  } catch (error) {
    console.error("[MeineWeltPage]", error);
    const detail =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    loadError = `Deine Welt konnte nicht geladen werden: ${detail}`;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <MembershipCreditsHeader
            badge={
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                {allowFamily ? "Familie" : "Meine Welt"}
              </p>
            }
            initialCredits={initialCredits}
            checkoutEnabled={hasStripeCheckoutConfig()}
          />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Meine Welt
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            {allowFamily
              ? "Lege für jedes Kind ein eigenes Profil an — mit Namen, Freunden, Interessen und Wünschen. So werden persönliche Geschichten wirklich passend."
              : "Lege ein Profil für dein Kind an — mit Namen, Freunden, Interessen und Wünschen. So werden persönliche Geschichten wirklich passend."}
          </p>

          {loadError ? (
            <p className="mt-8 rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
              {loadError}
            </p>
          ) : (
            <div className="mt-10">
              <MyWorldManager
                initialProfiles={profiles}
                allowFamily={allowFamily}
                enabledFeatures={features}
                typographyDefaults={typographyDefaults}
              />
            </div>
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
