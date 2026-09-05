/**
 * Shared shell for the gated membership composer (`/geschichte`).
 * Package label + feature flags come from `membership_packages`.
 */

import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import { requireAnyMembershipPage } from "@/lib/auth/require-membership";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { loadPackageAccessForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { loadChildProfileOptionsForUser } from "@/lib/world/story-options";

/**
 * Auth + membership gate, then composer UI with package-driven features.
 */
export async function MembershipStoryPage() {
  await requireAnyMembershipPage();

  const lengthCatalog = await loadStoryLengthCatalog();
  const access = await loadPackageAccessForCurrentUser();
  const packageLabel = access?.label ?? "Basis";
  const enabledFeatures = access?.features ?? [];
  const allowMeineWelt = featuresInclude(enabledFeatures, "meine_welt");
  const childProfiles = allowMeineWelt
    ? await loadChildProfileOptionsForUser(true)
    : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            {packageLabel} für dich
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Wähl dein Thema. Lies deine Geschichte.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            {allowMeineWelt
              ? "Nimm ein Top-Thema oder schalte „Ganz persönlich“ ein. Dann stell Schulstufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."
              : "Nimm ein Top-Thema und stell Schulstufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."}
          </p>
          <div className="mt-10">
            <FreeStoryForm
              lengthCatalog={lengthCatalog}
              childProfiles={childProfiles}
              enabledFeatures={enabledFeatures}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
