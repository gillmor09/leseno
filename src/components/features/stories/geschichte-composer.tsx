"use client";

/**
 * Client shell for `/geschichte`: package badge + live credits + composer.
 */

import { useState } from "react";
import { InviteFriendsCard } from "@/components/features/marketing/invite-friends-card";
import { CreditsCheckoutButton } from "@/components/features/pricing/pricing-checkout-buttons";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import type { StoryLengthCatalog } from "@/lib/stories/length";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import type { PackageFeatureId } from "@/lib/users/packages";
import type { ChildProfileOption } from "@/lib/world/catalog";

export function GeschichteComposer({
  packageLabel,
  initialCredits,
  creditsCheckoutEnabled,
  allowMeineWelt,
  lengthCatalog,
  typographyDefaults,
  childProfiles,
  enabledFeatures,
  inviteUserId = null,
}: {
  packageLabel: string;
  initialCredits: number;
  creditsCheckoutEnabled: boolean;
  allowMeineWelt: boolean;
  lengthCatalog: StoryLengthCatalog;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  childProfiles: ChildProfileOption[] | null;
  enabledFeatures: readonly PackageFeatureId[];
  inviteUserId?: string | null;
}) {
  const [credits, setCredits] = useState(initialCredits);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
          {packageLabel} für dich
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-extrabold tracking-wide text-white tabular-nums"
            title="Aktueller Credits-Stand"
          >
            {credits.toLocaleString("de-DE")} Credits
          </p>
          <CreditsCheckoutButton
            enabled={creditsCheckoutEnabled}
            variant="inline"
          />
        </div>
      </div>
      <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
        Wähl dein Thema. Lies deine Geschichte.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
        {allowMeineWelt
          ? "Nimm ein Top-Thema oder schalte „Ganz persönlich“ ein. Dann stell Lesestufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."
          : "Nimm ein Top-Thema und stell Lesestufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."}
      </p>
      {inviteUserId ? (
        <div className="mt-6">
          <InviteFriendsCard variant="compact" userId={inviteUserId} />
        </div>
      ) : null}
      <div className="mt-10">
        <FreeStoryForm
          lengthCatalog={lengthCatalog}
          typographyDefaults={typographyDefaults}
          childProfiles={childProfiles}
          enabledFeatures={enabledFeatures}
          initialCredits={credits}
          onCreditsChange={setCredits}
          inviteUserId={inviteUserId}
        />
      </div>
    </>
  );
}
