"use client";

/**
 * Freundes- und öffentliche Geschichten im Buchclub: Liste, Like, PDF.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getFriendSharedStoryAction,
  toggleFriendStoryLikeAction,
} from "@/app/actions/book-club";
import { StoryResultPanel } from "@/components/features/stories/story-result-panel";
import { BOOK_CLUB_SHARE_LABELS } from "@/lib/book-club/share";
import type {
  BookClubFriendship,
  FriendSharedStoryDetail,
  FriendSharedStorySummary,
} from "@/lib/book-club/repository";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import { cn } from "@/lib/utils";

type FriendFilter = "all" | string;

export function FriendStoriesBrowser({
  initialStories,
  friends,
  enabledFeatures,
  typographyDefaults,
}: {
  initialStories: FriendSharedStorySummary[];
  friends: BookClubFriendship[];
  enabledFeatures: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [stories, setStories] = useState(initialStories);
  const [filter, setFilter] = useState<FriendFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] =
    useState<FriendSharedStoryDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [likePendingId, setLikePendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setStories(initialStories);
  }, [initialStories]);

  const allowPdf = featuresInclude(enabledFeatures, "export");
  const allowReadingMode = featuresInclude(enabledFeatures, "lesemodus");
  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === "accepted"),
    [friends],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return stories;
    return stories.filter((story) => story.ownerUserId === filter);
  }, [stories, filter]);

  function handleToggleExpand(story: FriendSharedStorySummary) {
    if (expandedId === story.id) {
      setExpandedId(null);
      setExpandedStory(null);
      return;
    }
    setExpandedId(story.id);
    setLoadingId(story.id);
    startTransition(async () => {
      const result = await getFriendSharedStoryAction({ storyId: story.id });
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

  function handleToggleLike(story: FriendSharedStorySummary) {
    setLikePendingId(story.id);
    startTransition(async () => {
      const result = await toggleFriendStoryLikeAction({ storyId: story.id });
      setLikePendingId(null);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Like speichern fehlgeschlagen.");
        return;
      }
      const { liked, likeCount } = result.data;
      setStories((prev) =>
        prev.map((item) =>
          item.id === story.id
            ? { ...item, likedByMe: liked, likeCount }
            : item,
        ),
      );
      if (expandedStory?.id === story.id) {
        setExpandedStory({
          ...expandedStory,
          likedByMe: liked,
          likeCount,
        });
      }
    });
  }

  if (stories.length === 0) {
    return (
      <p className="rounded-[1.75rem] bg-white p-6 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
        Noch keine freigegebenen Geschichten. Freunde können für dich teilen —
        oder jemand gibt öffentlich frei.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {acceptedFriends.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            label="Alle"
            onClick={() => setFilter("all")}
          />
          {acceptedFriends.map((friend) => (
            <FilterChip
              key={friend.id}
              active={filter === friend.otherUserId}
              label={friend.otherFriendshipCode ?? "Freund"}
              onClick={() => setFilter(friend.otherUserId)}
            />
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-[1.75rem] bg-white p-6 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
          Keine Geschichten für diesen Filter.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((story) => {
            const stageLabel =
              STORY_SCHOOL_STAGES.find((s) => s.id === story.schoolStage)
                ?.label ?? story.schoolStage;
            const meta = [
              story.ownerFriendshipCode ?? "Mitglied",
              BOOK_CLUB_SHARE_LABELS[story.bookClubShare],
              stageLabel,
              formatDate(story.createdAt),
              story.likeCount > 0 ? `${story.likeCount} Likes` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const isExpanded = expandedId === story.id;

            return (
              <li key={story.id} className="space-y-3">
                <article className="rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 sm:p-6">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(story)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <h3 className="text-lg font-extrabold tracking-tight text-zinc-950 underline-offset-2 hover:text-orange-700 hover:underline sm:text-xl">
                        {story.title}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {meta}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={likePendingId === story.id}
                      onClick={() => handleToggleLike(story)}
                      className={cn(
                        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-70",
                        story.likedByMe
                          ? "bg-orange-700 text-white hover:bg-orange-800"
                          : "bg-gray-100 text-zinc-500 hover:bg-gray-200",
                      )}
                      aria-label={
                        story.likedByMe ? "Like entfernen" : "Like vergeben"
                      }
                      title={
                        story.likedByMe ? "Like entfernen" : "Like vergeben"
                      }
                    >
                      <Heart
                        className={cn(
                          "size-5",
                          story.likedByMe && "fill-current",
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
                    allowPdfExport={allowPdf}
                    allowReadingMode={allowReadingMode}
                    typographyDefaults={typographyDefaults}
                    eyebrow={`Von ${expandedStory.ownerFriendshipCode ?? "Mitglied"} · ${BOOK_CLUB_SHARE_LABELS[expandedStory.bookClubShare]}`}
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
        "rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition",
        active
          ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
          : "bg-white text-zinc-700 ring-zinc-950/10 hover:bg-gray-100",
      )}
    >
      {label}
    </button>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
