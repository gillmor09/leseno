import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MembershipCreditsHeader } from "@/components/features/membership/membership-credits-header";
import { AdventCalendarView } from "@/components/features/stories/advent-calendar-view";
import { getCurrentUser } from "@/lib/auth/session";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { hasAdventPreviewCookie } from "@/lib/stories/advent-preview-cookie";
import {
  getMyAdventBook,
  listMyAdventDayMeta,
} from "@/lib/stories/advent-repository";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { STORY_PATH } from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { loadChildProfile } from "@/lib/world/repository";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Adventskalender — Leseno",
  description: "Adventstüren öffnen und Geschichten lesen.",
};

export default async function AdventskalenderBookPage({ params }: PageProps) {
  await requireAnyMembershipPage("/adventskalender");

  const { id } = await params;
  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  if (!featuresInclude(features, "adventskalender")) {
    redirect(STORY_PATH);
  }

  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  const book = await getMyAdventBook(id);
  if (!book) notFound();

  const [days, typographyDefaults, previewActive, initialCredits] =
    await Promise.all([
      listMyAdventDayMeta(book.id),
      loadReadingTypographyDefaults(),
      hasAdventPreviewCookie(user.id, book.id),
      loadMyCredits().catch(() => 0),
    ]);

  let readingModePrefs = null;
  let readableAloud = true;
  let wordHighlight = true;
  if (book.childProfileId) {
    const profile = await loadChildProfile(book.childProfileId);
    if (profile) {
      readingModePrefs = profile.readingModePrefs;
      readableAloud = profile.readableAloud;
      wordHighlight = profile.wordHighlight;
    }
  }

  const { pinHash: _pin, ...safeBook } = book;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <MembershipCreditsHeader
            badge={
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                Advent {safeBook.year}
              </p>
            }
            initialCredits={initialCredits}
            checkoutEnabled={hasStripeCheckoutConfig()}
          />
          <p className="mt-6">
            <a
              href="/adventskalender"
              className="text-sm font-bold text-orange-700 underline-offset-2 hover:underline"
            >
              ← Alle Adventskalenderbücher
            </a>
          </p>
          <div className="mt-6">
            <AdventCalendarView
              book={safeBook}
              initialDays={days}
              initialPreviewActive={previewActive}
              enabledFeatures={features}
              typographyDefaults={typographyDefaults}
              readingModePrefs={readingModePrefs}
              readableAloud={readableAloud}
              wordHighlight={wordHighlight}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
