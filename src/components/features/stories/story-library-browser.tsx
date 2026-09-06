"use client";

/**
 * Meine Bücherei: title cards, favorites, read flag, expand into StoryResultPanel.
 * Continuations (`parent_story_id`) render indented under their predecessor.
 */

import { useMemo, useState, useTransition } from "react";
import { BookCheck, GitBranch, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMyStoryAction,
  getMyStoryAction,
  setMyStoryFavoriteAction,
  setMyStoryReadAction,
} from "@/app/actions/story-library";
import { StoryResultPanel } from "@/components/features/stories/story-result-panel";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { StoryLengthCatalog } from "@/lib/stories/length";
import type { AdventBookSummary } from "@/lib/stories/advent-repository";
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

type StoryTreeRow = {
  story: UserStorySummary;
  depth: number;
};

/**
 * Flattens stories into a tree walk: roots (no parent in the set) first,
 * then children indented. Roots keep favorite-first / newest ordering.
 */
function flattenStoryTree(stories: UserStorySummary[]): StoryTreeRow[] {
  const byId = new Map(stories.map((story) => [story.id, story]));
  const children = new Map<string, UserStorySummary[]>();

  for (const story of stories) {
    const parentId = story.parentStoryId;
    if (parentId && byId.has(parentId)) {
      const list = children.get(parentId) ?? [];
      list.push(story);
      children.set(parentId, list);
    }
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const roots = stories
    .filter(
      (story) =>
        !story.parentStoryId || !byId.has(story.parentStoryId),
    )
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const rows: StoryTreeRow[] = [];
  const walk = (story: UserStorySummary, depth: number) => {
    rows.push({ story, depth });
    for (const child of children.get(story.id) ?? []) {
      walk(child, depth + 1);
    }
  };
  for (const root of roots) {
    walk(root, 0);
  }
  return rows;
}

export function StoryLibraryBrowser({
  initialStories,
  initialAdventBooks = [],
  profileOptions,
  enabledFeatures,
  typographyDefaults,
  lengthCatalog,
}: {
  initialStories: UserStorySummary[];
  /** Ultimate Advent books shown above the story list. */
  initialAdventBooks?: AdventBookSummary[];
  /** Child profiles for filter chips + Lesemodus prefs. */
  profileOptions: LibraryProfileOption[];
  enabledFeatures: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  /** Needed for „Wie könnte es weitergehen?“ (Pro+). */
  lengthCatalog: StoryLengthCatalog;
}) {
  const [stories, setStories] = useState(initialStories);
  const [adventBooks] = useState(initialAdventBooks);
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
  const [deleteTarget, setDeleteTarget] = useState<UserStorySummary | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);
  const [, startTransition] = useTransition();

  const allowVorlesen = featuresInclude(enabledFeatures, "vorlesen");
  const allowMarkierung = featuresInclude(enabledFeatures, "markierung");
  const allowPdf = featuresInclude(enabledFeatures, "export");
  const allowFactWhy = featuresInclude(enabledFeatures, "warum");
  const allowFactWhyMore = featuresInclude(enabledFeatures, "hintergrund");
  const allowReadingMode = featuresInclude(enabledFeatures, "lesemodus");
  const allowContinue = featuresInclude(enabledFeatures, "fortsetzen");
  const allowAdvent = featuresInclude(enabledFeatures, "adventskalender");

  const filtered = useMemo(() => {
    if (filter === "all") return stories;
    if (filter === "free") {
      return stories.filter((story) => !story.childProfileId);
    }
    return stories.filter((story) => story.childProfileId === filter);
  }, [stories, filter]);

  const treeRows = useMemo(
    () => flattenStoryTree(filtered),
    [filtered],
  );

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
        prev.map((item) =>
          item.id === story.id ? { ...item, isFavorite: next } : item,
        ),
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

  function handleDeleteConfirm() {
    if (!deleteTarget || deletePending) return;
    const target = deleteTarget;
    setDeletePending(true);
    startTransition(async () => {
      const result = await deleteMyStoryAction({ storyId: target.id });
      setDeletePending(false);
      if (!result.success) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      setStories((prev) =>
        prev
          .filter((item) => item.id !== target.id)
          .map((item) =>
            item.parentStoryId === target.id
              ? { ...item, parentStoryId: null }
              : item,
          ),
      );
      if (expandedId === target.id) {
        setExpandedId(null);
        setExpandedStory(null);
      }
      setDeleteTarget(null);
      toast.success("Geschichte gelöscht.");
    });
  }

  const showProfileFilters = profiles.length > 0;

  return (
    <div className="mt-10 space-y-4">
      {allowAdvent && adventBooks.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
            Adventskalenderbücher
          </p>
          <ul className="space-y-3">
            {adventBooks.map((book) => (
              <li key={book.id}>
                <a
                  href={`/adventskalender/${book.id}`}
                  className="block rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:ring-orange-700/30 sm:p-6"
                >
                  <h2 className="text-lg font-extrabold tracking-tight text-zinc-950 sm:text-xl">
                    {book.title}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {book.daysReady}/24 Tage ·{" "}
                    {book.status === "ready"
                      ? "fertig"
                      : book.status === "failed"
                        ? "unterbrochen"
                        : "in Arbeit"}
                    {book.profileDisplayName
                      ? ` · ${book.profileDisplayName}`
                      : null}
                  </p>
                </a>
              </li>
            ))}
          </ul>
          {allowAdvent ? (
            <p className="text-sm font-semibold text-zinc-600">
              <a
                href="/adventskalender"
                className="text-orange-700 underline-offset-2 hover:underline"
              >
                Neues Adventskalenderbuch anlegen
              </a>
            </p>
          ) : null}
        </div>
      ) : allowAdvent ? (
        <p className="rounded-[1.75rem] bg-white p-5 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10 sm:p-6">
          Noch kein Adventskalenderbuch.{" "}
          <a
            href="/adventskalender"
            className="font-bold text-orange-700 underline-offset-2 hover:underline"
          >
            Jetzt anlegen
          </a>
        </p>
      ) : null}

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

      {treeRows.length === 0 ? (
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
          {treeRows.map(({ story, depth }) => {
            const stageLabel =
              STORY_SCHOOL_STAGES.find(
                (stage) => stage.id === story.schoolStage,
              )?.label ?? story.schoolStage;
            const storyProfile = story.childProfileId
              ? (profiles.find((p) => p.id === story.childProfileId) ?? null)
              : null;
            const meta = [
              depth > 0 ? "Fortsetzung" : null,
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
              <li
                key={story.id}
                className="space-y-3"
                style={
                  depth > 0
                    ? { marginLeft: `min(${depth * 1.25}rem, 3rem)` }
                    : undefined
                }
              >
                <article
                  className={cn(
                    "rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 sm:p-6",
                    story.isRead && "opacity-90",
                    depth > 0 && "border-l-4 border-orange-400",
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
                          "flex items-start gap-2 text-lg font-extrabold tracking-tight underline-offset-2 hover:text-orange-700 hover:underline sm:text-xl",
                          story.isRead ? "text-zinc-500" : "text-zinc-950",
                        )}
                      >
                        {depth > 0 ? (
                          <GitBranch
                            className="mt-1 size-4 shrink-0 text-orange-600"
                            aria-hidden
                          />
                        ) : null}
                        <span>{story.title}</span>
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
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(story)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-zinc-500 transition-all duration-200 ease-in-out hover:bg-orange-100 hover:text-orange-800"
                      aria-label="Geschichte löschen"
                      title="Geschichte löschen"
                    >
                      <Trash2 className="size-5" aria-hidden />
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
                    allowContinue={allowContinue}
                    libraryStoryId={expandedStory.id}
                    lengthCatalog={lengthCatalog}
                    continueLengthStep={
                      expandedStory.lengthStep ?? "mittel"
                    }
                    continueMood={expandedStory.mood ?? "spannend"}
                    onContinued={(result) => {
                      const summary: UserStorySummary = {
                        id: result.libraryStoryId,
                        title: titleFromHtmlHint(result.storyHtml),
                        childProfileId: story.childProfileId,
                        profileDisplayName: story.profileDisplayName,
                        isFavorite: false,
                        isRead: false,
                        schoolStage: result.schoolStage,
                        personalMode: story.personalMode,
                        parentStoryId: story.id,
                        createdAt: new Date().toISOString(),
                      };
                      setStories((prev) => [summary, ...prev]);
                      setExpandedId(result.libraryStoryId);
                      setExpandedStory({
                        ...summary,
                        storyHtml: result.storyHtml,
                        facts: result.facts,
                        lengthStep: expandedStory.lengthStep,
                        mood: expandedStory.mood,
                        topic: expandedStory.topic,
                        syllableHelp: expandedStory.syllableHelp,
                        includeImages: expandedStory.includeImages,
                        creditsCharged: null,
                      });
                    }}
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

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Geschichte löschen?"
        description={
          deleteTarget
            ? `Die Geschichte „${deleteTarget.title}“ wird dauerhaft aus der Bücherei entfernt. Fortsetzungen bleiben erhalten, verlieren aber die Verknüpfung zu dieser Vorgeschichte. Das lässt sich nicht rückgängig machen.`
            : ""
        }
        confirmLabel="Geschichte löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
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

/** Best-effort title for optimistic library insert after continue. */
function titleFromHtmlHint(html: string): string {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match?.[1]) return "Fortsetzung";
  return match[1].replace(/<[^>]+>/g, "").trim() || "Fortsetzung";
}
