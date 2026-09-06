"use client";

/**
 * Client shell for `/geschichte`: package badge + live credits + composer.
 */

import { InviteFriendsCard } from "@/components/features/marketing/invite-friends-card";
import {
  MembershipCreditsHeader,
  useMembershipCredits,
} from "@/components/features/membership/membership-credits-header";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import type { StoryLengthCatalog } from "@/lib/stories/length";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import type { ChildProfileOption } from "@/lib/world/catalog";

function GeschichteComposerBody({
  allowMeineWelt,
  allowAdvent,
  lengthCatalog,
  typographyDefaults,
  childProfiles,
  enabledFeatures,
  inviteUserId,
  fallbackCredits,
}: {
  allowMeineWelt: boolean;
  allowAdvent: boolean;
  lengthCatalog: StoryLengthCatalog;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  childProfiles: ChildProfileOption[] | null;
  enabledFeatures: readonly PackageFeatureId[];
  inviteUserId: string | null;
  fallbackCredits: number;
}) {
  const creditsApi = useMembershipCredits();
  const credits = creditsApi?.credits ?? fallbackCredits;
  const onCreditsChange = creditsApi?.onCreditsChange;

  return (
    <>
      <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
        Wähl dein Thema. Lies deine Geschichte.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
        {allowMeineWelt
          ? "Nimm ein Top-Thema oder schalte „Ganz persönlich“ ein. Dann stell Lesestufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."
          : "Nimm ein Top-Thema und stell Lesestufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."}
      </p>
      {allowAdvent ? (
        <p className="mt-4 max-w-2xl text-sm font-semibold text-zinc-700">
          Ultimate:{" "}
          <a
            href="/adventskalender"
            className="font-extrabold text-orange-700 underline-offset-2 hover:underline"
          >
            Adventskalenderbuch mit 24 Tagen
          </a>{" "}
          anlegen.
        </p>
      ) : null}
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
          onCreditsChange={onCreditsChange}
          inviteUserId={inviteUserId}
        />
      </div>
    </>
  );
}

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
  const allowAdvent = featuresInclude(enabledFeatures, "adventskalender");

  return (
    <MembershipCreditsHeader
      badge={
        <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
          {packageLabel} für dich
        </p>
      }
      initialCredits={initialCredits}
      checkoutEnabled={creditsCheckoutEnabled}
    >
      <GeschichteComposerBody
        allowMeineWelt={allowMeineWelt}
        allowAdvent={allowAdvent}
        lengthCatalog={lengthCatalog}
        typographyDefaults={typographyDefaults}
        childProfiles={childProfiles}
        enabledFeatures={enabledFeatures}
        inviteUserId={inviteUserId}
        fallbackCredits={initialCredits}
      />
    </MembershipCreditsHeader>
  );
}
