import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MembershipCreditsHeader } from "@/components/features/membership/membership-credits-header";
import { AdventBookCreateForm } from "@/components/features/stories/advent-book-create-form";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { listMyAdventBooks } from "@/lib/stories/advent-repository";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { loadMyCredits } from "@/lib/users/billing";
import { STORY_PATH } from "@/lib/users/catalog";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { loadChildProfileOptionsForUser } from "@/lib/world/story-options";

export const metadata: Metadata = {
  title: "Adventskalenderbuch — Leseno",
  description:
    "24 aufeinander aufbauende Adventsgeschichten — tagesweise öffnen, mit PIN-Vorschau für Eltern.",
};

/**
 * Ultimate Advent calendar: create a new book or jump to existing ones.
 */
export default async function AdventskalenderPage() {
  await requireAnyMembershipPage("/adventskalender");

  const access = await loadPackageAccessForCurrentUser();
  const features = access?.features ?? [];
  if (!featuresInclude(features, "adventskalender")) {
    redirect(STORY_PATH);
  }

  const allowMeineWelt = featuresInclude(features, "meine_welt");
  const [lengthCatalog, books, initialCredits] = await Promise.all([
    loadStoryLengthCatalog(),
    listMyAdventBooks().catch(() => []),
    loadMyCredits().catch(() => 0),
  ]);
  const childProfiles = allowMeineWelt
    ? await loadChildProfileOptionsForUser(true)
    : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <MembershipCreditsHeader
            badge={
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                Ultimate
              </p>
            }
            initialCredits={initialCredits}
            checkoutEnabled={hasStripeCheckoutConfig()}
          >
            <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
              Adventskalenderbuch
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
              Ein Buch mit 24 Kapiteln — jedes öffnet sich erst am richtigen
              Dezember-Tag. In der Bücherei findest du deine Kalender wieder.
            </p>

            {books.length > 0 ? (
              <ul className="mt-8 space-y-3">
                {books.map((book) => (
                  <li key={book.id}>
                    <a
                      href={`/adventskalender/${book.id}`}
                      className="block rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:ring-orange-700/30 sm:p-6"
                    >
                      <p className="text-lg font-extrabold text-zinc-950">
                        {book.title}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {book.daysReady}/24 Tage ·{" "}
                        {book.status === "ready"
                          ? "fertig"
                          : book.status === "failed"
                            ? "unterbrochen"
                            : "in Arbeit"}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-10">
              <AdventBookCreateForm
                lengthCatalog={lengthCatalog}
                childProfiles={childProfiles}
                enabledFeatures={features}
              />
            </div>
          </MembershipCreditsHeader>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
