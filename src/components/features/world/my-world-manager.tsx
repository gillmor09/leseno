"use client";

/**
 * Meine Welt hub: tabbed child profiles (+ add tab). Single profile hides tabs.
 */

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { MyWorldProfileEditor } from "@/components/features/world/my-world-profile-editor";
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
  allowFamily = true,
  enabledFeatures = [],
  typographyDefaults,
}: {
  initialProfiles: ChildProfile[];
  /** Package `meine_welt_familie`: allow a second+ child profile. */
  allowFamily?: boolean;
  /** Package features that unlock profile reading extras. */
  enabledFeatures?: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeTab, setActiveTab] = useState<TabId>(
    initialProfiles[0]?.id ?? "new",
  );

  const canAddChild = allowFamily || profiles.length === 0;

  const activeProfile = useMemo(
    () =>
      activeTab === "new"
        ? null
        : (profiles.find((profile) => profile.id === activeTab) ?? null),
    [activeTab, profiles],
  );

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
              }
            : profile,
        );
      }
      return [...withClearedDefault, saved];
    });
    setActiveTab(saved.id);
  }

  function handleDeleted(profileId: string) {
    setProfiles((current) => {
      const next = current.filter((profile) => profile.id !== profileId);
      setActiveTab(next[0]?.id ?? "new");
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
            return (
              <button
                key={profile.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(profile.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out",
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
          {canAddChild ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "new"}
              onClick={() => setActiveTab("new")}
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
          </p>
          {canAddChild ? (
            <button
              type="button"
              onClick={() => setActiveTab("new")}
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
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          canDelete={false}
          enabledFeatures={enabledFeatures}
        />
      ) : activeProfile ? (
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
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          canDelete
          enabledFeatures={enabledFeatures}
        />
      ) : canAddChild ? (
        <MyWorldProfileEditor
          key={`fallback-new-${profiles.length}`}
          profileId={null}
          initialFields={newProfileFields}
          initialReadingModePrefs={null}
          typographyDefaults={typographyDefaults}
          otherDefaultName={otherDefaultName}
          onClaimDefault={claimDefault}
          onSaved={handleSaved}
          canDelete={false}
          enabledFeatures={enabledFeatures}
        />
      ) : null}
    </div>
  );
}
