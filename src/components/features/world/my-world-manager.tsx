"use client";

/**
 * Meine Welt hub: tabbed child profiles (+ add tab). Single profile hides tabs.
 * PIN-protected profiles require unlock before the editor is shown.
 */

import { useMemo, useState } from "react";
import { Lock, Plus } from "lucide-react";
import { MyWorldProfileEditor } from "@/components/features/world/my-world-profile-editor";
import { ChildProfilePinUnlockDialog } from "@/components/features/world/child-profile-pin-unlock-dialog";
import {
  EMPTY_CHILD_PROFILE_FIELDS,
  type ChildProfile,
} from "@/lib/world/catalog";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import type { PackageFeatureId } from "@/lib/users/packages";
import { cn } from "@/lib/utils";

type TabId = string | "new";

export function MyWorldManager({
  initialProfiles,
  initialUnlockedProfileIds = [],
  allowFamily = true,
  enabledFeatures = [],
  typographyDefaults,
}: {
  initialProfiles: ChildProfile[];
  /** Profile ids without PIN or already unlocked via cookie. */
  initialUnlockedProfileIds?: string[];
  /** Package `meine_welt_familie`: allow a second+ child profile. */
  allowFamily?: boolean;
  /** Package features that unlock profile reading extras. */
  enabledFeatures?: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [unlockedIds, setUnlockedIds] = useState(
    () => new Set(initialUnlockedProfileIds),
  );
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const first = initialProfiles[0];
    if (!first) return "new";
    if (!first.hasPin || initialUnlockedProfileIds.includes(first.id)) {
      return first.id;
    }
    return first.id;
  });
  const [pendingUnlock, setPendingUnlock] = useState<{
    profileId: string;
    profileName: string;
  } | null>(null);

  const canAddChild = allowFamily || profiles.length === 0;

  const activeProfile = useMemo(
    () =>
      activeTab === "new"
        ? null
        : (profiles.find((profile) => profile.id === activeTab) ?? null),
    [activeTab, profiles],
  );

  const activeUnlocked =
    activeProfile == null ||
    !activeProfile.hasPin ||
    unlockedIds.has(activeProfile.id);

  /** First child defaults to Standard; further children start with toggle off. */
  const newProfileFields = useMemo(
    () => ({
      ...EMPTY_CHILD_PROFILE_FIELDS,
      isDefault: profiles.length === 0,
    }),
    [profiles.length],
  );

  const otherDefaultName = useMemo(() => {
    const other = profiles.find(
      (profile) =>
        profile.isDefault &&
        (activeTab === "new" || profile.id !== activeTab),
    );
    if (!other) return null;
    return other.displayName.trim() || "Ohne Namen";
  }, [activeTab, profiles]);

  function claimDefault() {
    setProfiles((current) =>
      current.map((profile) => ({
        ...profile,
        isDefault: activeTab !== "new" && profile.id === activeTab,
      })),
    );
  }

  function requestTab(tab: TabId) {
    if (tab === "new") {
      setActiveTab("new");
      return;
    }
    const profile = profiles.find((row) => row.id === tab);
    if (!profile) return;
    if (profile.hasPin && !unlockedIds.has(profile.id)) {
      setPendingUnlock({
        profileId: profile.id,
        profileName: profile.displayName.trim() || "Ohne Namen",
      });
      return;
    }
    setActiveTab(tab);
  }

  const showTabs = profiles.length > 1 || (canAddChild && activeTab === "new");

  function handleSaved(saved: ChildProfile) {
    setProfiles((current) => {
      const withClearedDefault = saved.isDefault
        ? current.map((profile) =>
            profile.id === saved.id
              ? profile
              : { ...profile, isDefault: false },
          )
        : current;
      const exists = withClearedDefault.some(
        (profile) => profile.id === saved.id,
      );
      if (exists) {
        return withClearedDefault.map((profile) =>
          profile.id === saved.id
            ? {
                ...profile,
                ...saved,
                sortOrder: profile.sortOrder,
                hasPin: saved.hasPin ?? profile.hasPin,
              }
            : profile,
        );
      }
      return [...withClearedDefault, { ...saved, hasPin: saved.hasPin ?? false }];
    });
    setUnlockedIds((current) => new Set(current).add(saved.id));
    setActiveTab(saved.id);
  }

  function handleDeleted(profileId: string) {
    setProfiles((current) => {
      const next = current.filter((profile) => profile.id !== profileId);
      setActiveTab(next[0]?.id ?? "new");
      return next;
    });
    setUnlockedIds((current) => {
      const next = new Set(current);
      next.delete(profileId);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {showTabs ? (
        <div
          role="tablist"
          aria-label="Kinder-Profile"
          className="flex flex-wrap gap-2"
        >
          {profiles.map((profile) => {
            const selected = activeTab === profile.id;
            const locked =
              profile.hasPin && !unlockedIds.has(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => requestTab(profile.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out",
                  selected
                    ? "bg-yellow-400 text-zinc-950"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-100",
                )}
              >
                {locked ? <Lock className="size-3.5" aria-hidden /> : null}
                {profile.displayName.trim() || "Ohne Namen"}
                {profile.isDefault ? (
                  <span className="ml-1 text-[0.65rem] font-extrabold tracking-wide text-orange-800 uppercase">
                    Standard
                  </span>
                ) : null}
              </button>
            );
          })}
          {canAddChild ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "new"}
              onClick={() => requestTab("new")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out",
                activeTab === "new"
                  ? "bg-yellow-400 text-zinc-950"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-100",
              )}
            >
              <Plus className="size-4" aria-hidden />
              Kind hinzufügen
            </button>
          ) : null}
        </div>
      ) : profiles.length === 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-zinc-600">
            Profil:{" "}
            <span className="font-extrabold text-zinc-950">
              {profiles[0]!.displayName.trim() || "Ohne Namen"}
            </span>
            {profiles[0]!.hasPin && !unlockedIds.has(profiles[0]!.id) ? (
              <Lock className="ml-1 inline size-3.5 text-zinc-500" aria-hidden />
            ) : null}
          </p>
          {canAddChild ? (
            <button
              type="button"
              onClick={() => requestTab("new")}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-xs font-extrabold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-yellow-300"
            >
              <Plus className="size-3.5" aria-hidden />
              Weiteres Kind
            </button>
          ) : null}
        </div>
      ) : null}

      {activeTab === "new" && canAddChild ? (
        <MyWorldProfileEditor
          key={`new-${profiles.length}`}
          profileId={null}
          initialFields={newProfileFields}
          initialReadingModePrefs={null}
          initialHasPin={false}
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          canDelete={false}
          enabledFeatures={enabledFeatures}
        />
      ) : activeProfile && activeUnlocked ? (
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
          initialHasPin={activeProfile.hasPin}
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onHasPinChange={(hasPin) => {
            setProfiles((current) =>
              current.map((profile) =>
                profile.id === activeProfile.id
                  ? { ...profile, hasPin }
                  : profile,
              ),
            );
            if (hasPin) {
              setUnlockedIds((current) =>
                new Set(current).add(activeProfile.id),
              );
            } else {
              setUnlockedIds((current) => {
                const next = new Set(current);
                next.delete(activeProfile.id);
                return next;
              });
            }
          }}
          onLocked={() => {
            setUnlockedIds((current) => {
              const next = new Set(current);
              next.delete(activeProfile.id);
              return next;
            });
          }}
          canDelete
          enabledFeatures={enabledFeatures}
        />
      ) : activeProfile && !activeUnlocked ? (
        <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-xl ring-1 ring-zinc-950/10">
          <Lock className="mx-auto size-8 text-orange-700" aria-hidden />
          <h2 className="mt-4 text-xl font-extrabold text-zinc-950">
            Profil geschützt
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            „{activeProfile.displayName.trim() || "Ohne Namen"}“ ist mit einer
            Eltern-PIN gesichert.
          </p>
          <button
            type="button"
            onClick={() =>
              setPendingUnlock({
                profileId: activeProfile.id,
                profileName:
                  activeProfile.displayName.trim() || "Ohne Namen",
              })
            }
            className="mt-6 inline-flex rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
          >
            Mit PIN entsperren
          </button>
        </div>
      ) : canAddChild ? (
        <MyWorldProfileEditor
          key={`fallback-new-${profiles.length}`}
          profileId={null}
          initialFields={newProfileFields}
          initialReadingModePrefs={null}
          initialHasPin={false}
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          canDelete={false}
          enabledFeatures={enabledFeatures}
        />
      ) : null}

      {pendingUnlock ? (
        <ChildProfilePinUnlockDialog
          open
          profileId={pendingUnlock.profileId}
          profileName={pendingUnlock.profileName}
          onCancel={() => setPendingUnlock(null)}
          onUnlocked={() => {
            const id = pendingUnlock.profileId;
            setUnlockedIds((current) => new Set(current).add(id));
            setActiveTab(id);
            setPendingUnlock(null);
          }}
        />
      ) : null}
    </div>
  );
}
