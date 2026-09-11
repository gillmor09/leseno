"use client";

/**
 * Client shell for `/geschichte`: package badge + live credits + composer.
 */

import { HelpPageHeading } from "@/components/features/help/help-page-heading";
import { HelpTrigger } from "@/components/features/help/help-trigger";
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
  unlockedProfileIds,
  enabledFeatures,
  inviteUserId,
  fallbackCredits,
  isAdmin,
  childSessionLockedProfileId,
}: {
  allowMeineWelt: boolean;
  allowAdvent: boolean;
  lengthCatalog: StoryLengthCatalog;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  childProfiles: ChildProfileOption[] | null;
  unlockedProfileIds: string[];
  enabledFeatures: readonly PackageFeatureId[];
  inviteUserId: string | null;
  fallbackCredits: number;
  isAdmin: boolean;
  childSessionLockedProfileId: string | null;
}) {
  const creditsApi = useMembershipCredits();
  const credits = creditsApi?.credits ?? fallbackCredits;
  const onCreditsChange = creditsApi?.onCreditsChange;

  return (
    <>
      <HelpPageHeading title="Wähl dein Thema. Lies deine Geschichte." />
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
        {allowMeineWelt
          ? childSessionLockedProfileId
            ? "Deine Geschichte startet mit deinem Profil. Länge und Art kannst du grob anpassen — dann lies und staune."
            : "Nimm ein Hauptthema — ab Familie mit Mehr Tiefgang (Nebenthema & realistische Konflikte) — oder schalte „Ganz persönlich“ ein. Dann stell Lesestufe und Textlänge ein."
          : "Nimm ein Hauptthema — ab Familie mit Mehr Tiefgang (Nebenthema & realistische Konflikte). Dann stell Lesestufe und Textlänge ein."}
      </p>
      {allowAdvent && !childSessionLockedProfileId ? (
        <p className="mt-4 max-w-2xl text-sm font-semibold text-zinc-700">
          Komplett:{" "}
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
        <div className="mt-6 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <InviteFriendsCard variant="compact" userId={inviteUserId} />
          </div>
          <HelpTrigger slotId="einladen" className="mt-2 shrink-0" />
        </div>
      ) : null}
      <div className="mt-10">
        <FreeStoryForm
          lengthCatalog={lengthCatalog}
          typographyDefaults={typographyDefaults}
          childProfiles={childProfiles}
          initialUnlockedProfileIds={unlockedProfileIds}
          enabledFeatures={enabledFeatures}
          initialCredits={credits}
          onCreditsChange={onCreditsChange}
          inviteUserId={inviteUserId}
          isAdmin={isAdmin}
          childSessionLockedProfileId={childSessionLockedProfileId}
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
  unlockedProfileIds = [],
  enabledFeatures,
  inviteUserId = null,
  isAdmin = false,
  childSessionLockedProfileId = null,
}: {
  packageLabel: string;
  initialCredits: number;
  creditsCheckoutEnabled: boolean;
  allowMeineWelt: boolean;
  lengthCatalog: StoryLengthCatalog;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  childProfiles: ChildProfileOption[] | null;
  unlockedProfileIds?: string[];
  enabledFeatures: readonly PackageFeatureId[];
  inviteUserId?: string | null;
  /** Live KI-Modell im Wartedialog (nur echte Admin-Session). */
  isAdmin?: boolean;
  /** Child cookie login: lock composer to this profile. */
  childSessionLockedProfileId?: string | null;
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
      helpSlotId="credits"
    >
      <GeschichteComposerBody
        allowMeineWelt={allowMeineWelt}
        allowAdvent={allowAdvent}
        lengthCatalog={lengthCatalog}
        typographyDefaults={typographyDefaults}
        childProfiles={childProfiles}
        unlockedProfileIds={unlockedProfileIds}
        enabledFeatures={enabledFeatures}
        inviteUserId={inviteUserId}
        fallbackCredits={initialCredits}
        isAdmin={isAdmin}
        childSessionLockedProfileId={childSessionLockedProfileId}
      />
    </MembershipCreditsHeader>
  );
}
