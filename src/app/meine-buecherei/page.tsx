import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MembershipCreditsHeader } from "@/components/features/membership/membership-credits-header";
import { StoryLibraryBrowser } from "@/components/features/stories/story-library-browser";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { listMyAdventBooks } from "@/lib/stories/advent-repository";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { listMyStories } from "@/lib/stories/library-repository";
import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { STORY_PATH } from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { listMyChildProfiles } from "@/lib/world/repository";

export const metadata: Metadata = {
  title: "Meine Bücherei — Leseno",
  description:
    "Alle gespeicherten Geschichten ansehen, Favoriten setzen und erneut lesen.",
};

/**
 * Membership story library: requires package feature `buecherei`.
 * Stories auto-save after generation when the feature is enabled.
 */
export default async function MeineBuechereiPage() {
  await requireAnyMembershipPage("/meine-buecherei");

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  if (!featuresInclude(features, "buecherei")) {
    redirect(STORY_PATH);
  }

  const allowMeineWelt = featuresInclude(features, "meine_welt");
  const allowAdvent = featuresInclude(features, "adventskalender");
  const [typographyDefaults, lengthCatalog, initialCredits] = await Promise.all([
    loadReadingTypographyDefaults(),
    loadStoryLengthCatalog(),
    loadMyCredits().catch(() => 0),
  ]);

  let stories: Awaited<ReturnType<typeof listMyStories>> = [];
  let adventBooks: Awaited<ReturnType<typeof listMyAdventBooks>> = [];
  let loadError: string | null = null;
  try {
    stories = await listMyStories();
  } catch (error) {
    console.error("[MeineBuechereiPage]", error);
    const detail =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    loadError = `Die Bücherei konnte nicht geladen werden: ${detail}`;
  }

  if (allowAdvent && !loadError) {
    try {
      adventBooks = await listMyAdventBooks();
    } catch (error) {
      console.error("[MeineBuechereiPage] advent", error);
    }
  }

  let profileOptions: {
    id: string;
    displayName: string;
    readingModePrefs: ReadingModePrefs | null;
    readableAloud: boolean;
    wordHighlight: boolean;
  }[] = [];
  if (allowMeineWelt) {
    try {
      const profiles = await listMyChildProfiles();
      profileOptions = profiles.map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        readingModePrefs: profile.readingModePrefs,
        readableAloud: profile.readableAloud,
        wordHighlight: profile.wordHighlight,
      }));
    } catch {
      profileOptions = [];
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <MembershipCreditsHeader
            badge={
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                Bücherei
              </p>
            }
            initialCredits={initialCredits}
            checkoutEnabled={hasStripeCheckoutConfig()}
          />
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Meine Bücherei
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Hier liegen alle Geschichten, die du erzeugt hast — automatisch
            gespeichert. Tippe auf den Titel zum Lesen; markiere Favoriten und
            Gelesen mit den Buttons rechts.
          </p>

          {loadError ? (
            <p className="mt-8 rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
              {loadError}
            </p>
          ) : (
            <StoryLibraryBrowser
              initialStories={stories}
              initialAdventBooks={adventBooks}
              profileOptions={profileOptions}
              enabledFeatures={features}
              typographyDefaults={typographyDefaults}
              lengthCatalog={lengthCatalog}
            />
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
