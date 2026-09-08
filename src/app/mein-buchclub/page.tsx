import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { BookClubPanel } from "@/components/features/book-club/book-club-panel";
import { MembershipCreditsHeader } from "@/components/features/membership/membership-credits-header";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import {
  getMyBookClubProfile,
  listFriendSharedStories,
  listMyFriendships,
} from "@/lib/book-club/repository";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { STORY_PATH } from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";

export const metadata: Metadata = {
  title: "Mein Buchclub — Leseno",
  description:
    "Freunde einladen, Freundschaftskennung teilen und freigegebene Geschichten lesen.",
};

/**
 * Top-level Buchclub (Plus+): friendship code, friends, email invite,
 * shared friend stories. Requires package feature `buchclub`.
 */
export default async function MeinBuchclubPage() {
  await requireAnyMembershipPage("/mein-buchclub");

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  if (!featuresInclude(features, "buchclub")) {
    redirect(STORY_PATH);
  }
  const [typographyDefaults, initialCredits] = await Promise.all([
    loadReadingTypographyDefaults(),
    loadMyCredits().catch(() => 0),
  ]);

  let friendshipCode: string | null = null;
  let friendships: Awaited<ReturnType<typeof listMyFriendships>> = [];
  let stories: Awaited<ReturnType<typeof listFriendSharedStories>> = [];
  let loadError: string | null = null;

  try {
    const [profile, friendRows, storyRows] = await Promise.all([
      getMyBookClubProfile(),
      listMyFriendships(),
      listFriendSharedStories(),
    ]);
    friendshipCode = profile.friendshipCode;
    friendships = friendRows;
    stories = storyRows;
  } catch (error) {
    console.error("[MeinBuchclubPage]", error);
    const detail =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    loadError = `Der Buchclub konnte nicht geladen werden: ${detail}`;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <MembershipCreditsHeader
            badge={
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                Buchclub
              </p>
            }
            initialCredits={initialCredits}
            checkoutEnabled={hasStripeCheckoutConfig()}
          />
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Mein Buchclub
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Teile deine Freundschaftskennung, lade Freunde zu leseno ein und
            lies Geschichten, die Freunde im Buchclub freigegeben haben.
          </p>

          {loadError ? (
            <p className="mt-8 rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
              {loadError}
            </p>
          ) : (
            <BookClubPanel
              initialFriendshipCode={friendshipCode}
              initialFriendships={friendships}
              initialStories={stories}
              enabledFeatures={features}
              typographyDefaults={typographyDefaults}
            />
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
