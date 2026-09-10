"use client";

/**
 * Meine Welt hub: profile tabs + create dialog. Empty state shows only
 * add button and Kind-Login hint; after create the full editor opens.
 */

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CreateChildProfileDialog } from "@/components/features/world/create-child-profile-dialog";
import { MyWorldProfileEditor } from "@/components/features/world/my-world-profile-editor";
import type { ChildProfile } from "@/lib/world/catalog";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import type { PackageFeatureId } from "@/lib/users/packages";
import { cn } from "@/lib/utils";

export function MyWorldManager({
  initialProfiles,
  allowFamily = true,
  enabledFeatures = [],
  typographyDefaults,
}: {
  initialProfiles: ChildProfile[];
  /** @deprecated PIN unlock removed; ignored. */
  initialUnlockedProfileIds?: string[];
  /** Package `meine_welt_familie`: allow a second+ child profile. */
  allowFamily?: boolean;
  /** Package features that unlock profile reading extras. */
  enabledFeatures?: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    () => initialProfiles[0]?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const canAddChild = allowFamily || profiles.length === 0;

  const activeProfile = useMemo(
    () =>
      activeProfileId
        ? (profiles.find((profile) => profile.id === activeProfileId) ?? null)
        : null,
    [activeProfileId, profiles],
  );

  const otherDefaultName = useMemo(() => {
    const other = profiles.find(
      (profile) =>
        profile.isDefault &&
        (!activeProfileId || profile.id !== activeProfileId),
    );
    if (!other) return null;
    return other.displayName.trim() || "Ohne Namen";
  }, [activeProfileId, profiles]);

  function claimDefault() {
    setProfiles((current) =>
      current.map((profile) => ({
        ...profile,
        isDefault: Boolean(activeProfileId) && profile.id === activeProfileId,
      })),
    );
  }

  function openCreateDialog() {
    if (!canAddChild) return;
    setCreateOpen(true);
  }

  function handleCreated(saved: ChildProfile) {
    setProfiles((current) => {
      const withClearedDefault = saved.isDefault
        ? current.map((profile) => ({ ...profile, isDefault: false }))
        : current;
      return [...withClearedDefault, saved];
    });
    setActiveProfileId(saved.id);
  }

  function handleSaved(saved: ChildProfile) {
    setProfiles((current) => {
      const withClearedDefault = saved.isDefault
        ? current.map((profile) =>
            profile.id === saved.id
              ? profile
              : { ...profile, isDefault: false },
          )
        : current;
      return withClearedDefault.map((profile) =>
        profile.id === saved.id
          ? {
              ...profile,
              ...saved,
              sortOrder: profile.sortOrder,
            }
          : profile,
      );
    });
    setActiveProfileId(saved.id);
  }

  function handleDeleted(profileId: string) {
    setProfiles((current) => {
      const next = current.filter((profile) => profile.id !== profileId);
      setActiveProfileId(next[0]?.id ?? null);
      return next;
    });
  }

  const showEmptyCreate = profiles.length === 0;

  return (
    <div className="space-y-6">
      {showEmptyCreate ? (
        <div className="space-y-4">
          <p className="rounded-[1.75rem] bg-orange-50 px-5 py-4 text-sm leading-relaxed text-orange-900 ring-1 ring-orange-700/10">
            Lege ein Kinder-Profil an und vergebe Kennung sowie Passwort. Damit
            kann sich dein Kind selbst anmelden — ohne Zugriff auf Meine Welt.
            Freunde, Interessen und Wünsche trägst du danach im Profil ein.
          </p>
          {canAddChild ? (
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-extrabold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-yellow-300 sm:w-auto"
            >
              <Plus className="size-4" aria-hidden />
              Kind hinzufügen
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Kinder-Profile"
              className="flex flex-wrap gap-2"
            >
              {profiles.map((profile) => {
                const selected = activeProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveProfileId(profile.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out",
                      selected
                        ? "bg-yellow-400 text-zinc-950"
                        : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-100",
                    )}
                  >
                    {profile.displayName.trim() || "Ohne Namen"}
                    {profile.isDefault ? (
                      <span className="ml-1 text-[0.65rem] font-extrabold tracking-wide text-orange-800 uppercase">
                        Standard
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {canAddChild ? (
              <button
                type="button"
                onClick={openCreateDialog}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100"
              >
                <Plus className="size-4" aria-hidden />
                Kind hinzufügen
              </button>
            ) : null}
          </div>

          {activeProfile ? (
            <MyWorldProfileEditor
              key={activeProfile.id}
              profileId={activeProfile.id}
              initialFields={{
                displayName: activeProfile.displayName,
                schoolStage: activeProfile.schoolStage,
                lengthStep: activeProfile.lengthStep,
                mood: activeProfile.mood,
                friends: activeProfile.friends,
                interests: activeProfile.interests,
                experiences: activeProfile.experiences,
                fears: activeProfile.fears,
                fearsGentle: activeProfile.fearsGentle,
                includeImages: activeProfile.includeImages,
                syllableHelp: activeProfile.syllableHelp,
                wordHighlight: activeProfile.wordHighlight,
                readableAloud: activeProfile.readableAloud,
                isDefault: activeProfile.isDefault,
              }}
              initialReadingModePrefs={activeProfile.readingModePrefs}
              initialLoginCode={activeProfile.loginCode}
              initialHasPassword={activeProfile.hasPassword}
              typographyDefaults={typographyDefaults}
              otherDefaultName={otherDefaultName}
              onClaimDefault={claimDefault}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onHasPasswordChange={(hasPassword) => {
                setProfiles((current) =>
                  current.map((profile) =>
                    profile.id === activeProfile.id
                      ? { ...profile, hasPassword }
                      : profile,
                  ),
                );
              }}
              onLoginCodeChange={(loginCode) => {
                setProfiles((current) =>
                  current.map((profile) =>
                    profile.id === activeProfile.id
                      ? { ...profile, loginCode }
                      : profile,
                  ),
                );
              }}
              canDelete
              enabledFeatures={enabledFeatures}
            />
          ) : null}
        </>
      )}

      <CreateChildProfileDialog
        open={createOpen}
        makeDefault={profiles.length === 0}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
