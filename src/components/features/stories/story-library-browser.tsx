"use client";

/**
 * Meine Bücherei: title cards, favorites, read flag, expand into StoryResultPanel.
 */

import { useMemo, useState, useTransition } from "react";
import { BookCheck, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import {
  getMyStoryAction,
  setMyStoryFavoriteAction,
  setMyStoryReadAction,
} from "@/app/actions/story-library";
import { StoryResultPanel } from "@/components/features/stories/story-result-panel";
import type {
  UserStoryDetail,
  UserStorySummary,
} from "@/lib/stories/library-repository";
import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import { FREE_READING_EXTRAS } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

type ProfileFilter = "all" | "free" | string;

type LibraryProfileOption = {
  id: string;
  displayName: string;
  readingModePrefs: ReadingModePrefs | null;
  readableAloud: boolean;
  wordHighlight: boolean;
};

export function StoryLibraryBrowser({
  initialStories,
  profileOptions,
  enabledFeatures,
  typographyDefaults,
}: {
  initialStories: UserStorySummary[];
  /** Child profiles for filter chips + Lesemodus prefs. */
  profileOptions: LibraryProfileOption[];
  enabledFeatures: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [stories, setStories] = useState(initialStories);
  const [profiles, setProfiles] = useState(profileOptions);
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState<UserStoryDetail | null>(
    null,
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(
    null,
  );
  const [readPendingId, setReadPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const allowVorlesen = featuresInclude(enabledFeatures, "vorlesen");
  const allowMarkierung = featuresInclude(enabledFeatures, "markierung");
  const allowPdf = featuresInclude(enabledFeatures, "export");
  const allowFactWhy = featuresInclude(enabledFeatures, "warum");
  const allowFactWhyMore = featuresInclude(enabledFeatures, "hintergrund");
  const allowReadingMode = featuresInclude(enabledFeatures, "lesemodus");

  const filtered = useMemo(() => {
    if (filter === "all") return stories;
    if (filter === "free") {
      return stories.filter((story) => !story.childProfileId);
    }
    return stories.filter((story) => story.childProfileId === filter);
  }, [stories, filter]);

  function handleToggleFavorite(story: UserStorySummary) {
    const next = !story.isFavorite;
    setFavoritePendingId(story.id);
    startTransition(async () => {
      const result = await setMyStoryFavoriteAction({
        storyId: story.id,
        isFavorite: next,
      });
      setFavoritePendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Favorit speichern fehlgeschlagen.");
        return;
      }
      setStories((prev) =>
        [...prev]
          .map((item) =>
            item.id === story.id ? { ...item, isFavorite: next } : item,
          )
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) {
              return a.isFavorite ? -1 : 1;
            }
            return b.createdAt.localeCompare(a.createdAt);
          }),
      );
      if (expandedStory?.id === story.id) {
        setExpandedStory({ ...expandedStory, isFavorite: next });
      }
    });
  }

  function handleToggleRead(story: UserStorySummary) {
    const next = !story.isRead;
    setReadPendingId(story.id);
    startTransition(async () => {
      const result = await setMyStoryReadAction({
        storyId: story.id,
        isRead: next,
      });
      setReadPendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Gelesen-Status speichern fehlgeschlagen.");
        return;
      }
      setStories((prev) =>
        prev.map((item) =>
          item.id === story.id ? { ...item, isRead: next } : item,
        ),
      );
      if (expandedStory?.id === story.id) {
        setExpandedStory({ ...expandedStory, isRead: next });
      }
    });
  }

  function handleToggleExpand(story: UserStorySummary) {
    if (expandedId === story.id) {
      setExpandedId(null);
      setExpandedStory(null);
      return;
    }

    setExpandedId(story.id);
    setLoadingId(story.id);
    startTransition(async () => {
      const result = await getMyStoryAction({ storyId: story.id });
      setLoadingId(null);
      if (!result.success || !result.data?.story) {
        toast.error(result.error ?? "Geschichte konnte nicht geladen werden.");
        setExpandedId(null);
        setExpandedStory(null);
        return;
      }
      setExpandedStory(result.data.story);
    });
  }

  const showProfileFilters = profiles.length > 0;

  return (
    <div className="mt-10 space-y-4">
      {showProfileFilters ? (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            label="Alle"
            onClick={() => setFilter("all")}
          />
          <FilterChip
            active={filter === "free"}
            label="Freies lesen"
            onClick={() => setFilter("free")}
          />
          {profiles.map((profile) => (
            <FilterChip
              key={profile.id}
              active={filter === profile.id}
              label={profile.displayName || "Ohne Namen"}
              onClick={() => setFilter(profile.id)}
            />
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-[1.75rem] bg-white p-8 text-sm leading-relaxed text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
          Noch keine Geschichten in der Bücherei. Erzeuge eine unter{" "}
          <a
            href="/geschichte"
            className="font-bold text-orange-700 underline-offset-2 hover:underline"
          >
            Meine Geschichte
          </a>
          — sie wird automatisch gespeichert.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((story) => {
            const stageLabel =
              STORY_SCHOOL_STAGES.find(
                (stage) => stage.id === story.schoolStage,
              )?.label ?? story.schoolStage;
            const storyProfile = story.childProfileId
              ? (profiles.find((p) => p.id === story.childProfileId) ?? null)
              : null;
            const meta = [
              story.profileDisplayName
                ? story.profileDisplayName
                : story.personalMode
                  ? "Persönlich"
                  : "Freies lesen",
              stageLabel,
              formatStoryDate(story.createdAt),
              story.isRead ? "Gelesen" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const isExpanded = expandedId === story.id;

            return (
              <li key={story.id} className="space-y-3">
                <article
                  className={cn(
                    "rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 sm:p-6",
                    story.isRead && "opacity-90",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(story)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <h2
                        className={cn(
                          "text-lg font-extrabold tracking-tight underline-offset-2 hover:text-orange-700 hover:underline sm:text-xl",
                          story.isRead ? "text-zinc-500" : "text-zinc-950",
                        )}
                      >
                        {story.title}
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {meta}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={readPendingId === story.id}
                      onClick={() => handleToggleRead(story)}
                      className={cn(
                        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-in-out disabled:opacity-70",
                        story.isRead
                          ? "bg-orange-700 text-white hover:bg-orange-800"
                          : "bg-gray-100 text-zinc-500 hover:bg-gray-200",
                      )}
                      aria-label={
                        story.isRead
                          ? "Als ungelesen markieren"
                          : "Als gelesen markieren"
                      }
                      title={
                        story.isRead
                          ? "Als ungelesen markieren"
                          : "Als gelesen markieren"
                      }
                    >
                      <BookCheck className="size-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={favoritePendingId === story.id}
                      onClick={() => handleToggleFavorite(story)}
                      className={cn(
                        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-in-out disabled:opacity-70",
                        story.isFavorite
                          ? "bg-yellow-400 text-zinc-950 hover:bg-yellow-300"
                          : "bg-gray-100 text-zinc-500 hover:bg-gray-200",
                      )}
                      aria-label={
                        story.isFavorite
                          ? "Favorit entfernen"
                          : "Als Favorit markieren"
                      }
                      title={
                        story.isFavorite
                          ? "Favorit entfernen"
                          : "Als Favorit markieren"
                      }
                    >
                      <Star
                        className={cn(
                          "size-5",
                          story.isFavorite && "fill-current",
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>
                </article>

                {isExpanded && loadingId === story.id ? (
                  <div className="flex items-center justify-center gap-2 rounded-[1.75rem] bg-white p-8 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
                    <Loader2 className="size-5 animate-spin text-orange-700" />
                    Geschichte wird geladen …
                  </div>
                ) : null}

                {isExpanded &&
                expandedStory &&
                expandedStory.id === story.id ? (
                  <StoryResultPanel
                    storyHtml={expandedStory.storyHtml}
                    facts={expandedStory.facts}
                    schoolStage={expandedStory.schoolStage}
                    readableAloud={
                      allowVorlesen &&
                      (storyProfile?.readableAloud ??
                        FREE_READING_EXTRAS.readableAloud)
                    }
                    wordHighlight={
                      allowMarkierung &&
                      (storyProfile?.wordHighlight ??
                        FREE_READING_EXTRAS.wordHighlight)
                    }
                    allowPdfExport={allowPdf}
                    allowFactWhy={allowFactWhy}
                    allowFactWhyMore={allowFactWhyMore}
                    allowReadingMode={allowReadingMode}
                    readingProfileId={story.childProfileId}
                    readingModePrefs={storyProfile?.readingModePrefs ?? null}
                    typographyDefaults={typographyDefaults}
                    onReadingModePrefsChange={(prefs) => {
                      if (!story.childProfileId) return;
                      const profileId = story.childProfileId;
                      setProfiles((current) =>
                        current.map((profile) =>
                          profile.id === profileId
                            ? { ...profile, readingModePrefs: prefs }
                            : profile,
                        ),
                      );
                    }}
                    eyebrow="Aus der Bücherei"
                    onClose={() => {
                      setExpandedId(null);
                      setExpandedStory(null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
        active
          ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
          : "bg-white text-zinc-700 ring-zinc-950/10 hover:bg-gray-100",
      )}
    >
      {label}
    </button>
  );
}

function formatStoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
