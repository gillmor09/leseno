"use client";

/**
 * Advent calendar UI: 24 doors, date lock, parent PIN preview, story panel.
 */

import { useMemo, useState, useTransition } from "react";
import { KeyRound, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateAdventDayAction,
  getAdventDayAction,
  lockAdventPreviewAction,
  unlockAdventPreviewAction,
} from "@/app/actions/advent";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { StoryResultPanel } from "@/components/features/stories/story-result-panel";
import {
  ADVENT_DAY_COUNT,
  adventUnlockDateIso,
  isAdventDoorOpen,
} from "@/lib/stories/advent";
import type {
  AdventBookSummary,
  AdventDayMeta,
} from "@/lib/stories/advent-repository";
import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import { FREE_READING_EXTRAS } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

type SafeBook = AdventBookSummary & {
  syllableHelp?: boolean;
  includeImages?: boolean;
};

export function AdventCalendarView({
  book: initialBook,
  initialDays,
  initialPreviewActive,
  enabledFeatures,
  typographyDefaults,
  readingModePrefs = null,
  readableAloud = FREE_READING_EXTRAS.readableAloud,
  wordHighlight = FREE_READING_EXTRAS.wordHighlight,
}: {
  book: SafeBook;
  initialDays: AdventDayMeta[];
  initialPreviewActive: boolean;
  enabledFeatures: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  readingModePrefs?: ReadingModePrefs | null;
  readableAloud?: boolean;
  wordHighlight?: boolean;
}) {
  const botGuard = useBotGuardFields();
  const [book, setBook] = useState(initialBook);
  const [days, setDays] = useState(initialDays);
  const [previewActive, setPreviewActive] = useState(initialPreviewActive);
  const [pin, setPin] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [storyHtml, setStoryHtml] = useState<string | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [storyTitle, setStoryTitle] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  const allowVorlesen = featuresInclude(enabledFeatures, "vorlesen");
  const allowMarkierung = featuresInclude(enabledFeatures, "markierung");
  const allowPdf = featuresInclude(enabledFeatures, "export");
  const allowFactWhy = featuresInclude(enabledFeatures, "warum");
  const allowFactWhyMore = featuresInclude(enabledFeatures, "hintergrund");
  const allowReadingMode = featuresInclude(enabledFeatures, "lesemodus");

  const dayMap = useMemo(() => {
    const map = new Map<number, AdventDayMeta>();
    for (const day of days) map.set(day.dayNumber, day);
    return map;
  }, [days]);

  const needsGeneration = book.daysReady < ADVENT_DAY_COUNT;

  function openDay(dayNumber: number) {
    setSelectedDay(dayNumber);
    setStoryHtml(null);
    setFacts([]);
    setStoryTitle(null);
    setLockedMessage(null);
    startTransition(async () => {
      const result = await getAdventDayAction({
        bookId: book.id,
        dayNumber,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Tag konnte nicht geladen werden.");
        return;
      }
      setPreviewActive(result.data.previewActive);
      const day = result.data.day;
      if (day.isLocked || !day.storyHtml) {
        setLockedMessage(
          `Tür ${dayNumber} öffnet sich am ${formatDeDate(day.unlockDate)}.`,
        );
        setStoryTitle(day.title);
        return;
      }
      setStoryHtml(day.storyHtml);
      setFacts(day.facts);
      setStoryTitle(day.title);
      if (day.userStoryId) {
        setDays((prev) =>
          prev.map((entry) =>
            entry.dayNumber === dayNumber
              ? {
                  ...entry,
                  title: day.title,
                  userStoryId: day.userStoryId,
                }
              : entry,
          ),
        );
      }
    });
  }

  function handleUnlockPreview() {
    startTransition(async () => {
      const result = await unlockAdventPreviewAction({
        bookId: book.id,
        pin,
      });
      if (!result.success) {
        toast.error(result.error ?? "PIN ungültig.");
        return;
      }
      setPreviewActive(true);
      setPin("");
      toast.success("Vorschau aktiv — alle Türen sind sichtbar.");
    });
  }

  function handleLockPreview() {
    startTransition(async () => {
      await lockAdventPreviewAction({ bookId: book.id });
      setPreviewActive(false);
      setStoryHtml(null);
      setLockedMessage(null);
      toast.success("Vorschau beendet.");
    });
  }

  function handleResumeGeneration() {
    startTransition(async () => {
      let ready = book.daysReady;
      for (let day = ready + 1; day <= ADVENT_DAY_COUNT; day += 1) {
        setGenerateProgress(day);
        const dayResult = await generateAdventDayAction({
          bookId: book.id,
          dayNumber: day,
          ...botGuard.getBotGuardPayload(),
        });
        if (!dayResult.success || !dayResult.data) {
          toast.error(dayResult.error ?? `Tag ${day} fehlgeschlagen.`);
          setBook((prev) => ({ ...prev, daysReady: ready, status: "failed" }));
          return;
        }
        ready = dayResult.data.daysReady;
        const title = dayResult.data.title;
        setDays((prev) => {
          const without = prev.filter((entry) => entry.dayNumber !== day);
          return [
            ...without,
            {
              dayNumber: day,
              title,
              hasStory: true,
              userStoryId: null,
            },
          ].sort((a, b) => a.dayNumber - b.dayNumber);
        });
        setBook((prev) => ({
          ...prev,
          daysReady: ready,
          status: ready >= ADVENT_DAY_COUNT ? "ready" : "generating",
        }));
      }
      setGenerateProgress(0);
      toast.success("Alle 24 Adventstage sind fertig!");
    });
  }

  return (
    <div className="space-y-8">
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />

      <div className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Advent {book.year}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950">
          {book.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {book.daysReady}/{ADVENT_DAY_COUNT} Tage bereit
          {book.status === "generating" ? " · noch in Arbeit" : null}
          {book.status === "failed" ? " · unterbrochen" : null}
          {previewActive ? " · Eltern-Vorschau aktiv" : null}
        </p>

        {needsGeneration ? (
          <div className="mt-4 space-y-2">
            {generateProgress > 0 ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-orange-900">
                <Loader2 className="size-4 animate-spin" />
                Tag {generateProgress} von {ADVENT_DAY_COUNT} …
              </p>
            ) : null}
            <button
              type="button"
              disabled={isPending}
              onClick={handleResumeGeneration}
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-70"
            >
              {book.daysReady === 0
                ? "Geschichten erzeugen"
                : "Erzeugung fortsetzen"}
            </button>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          {previewActive ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleLockPreview}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-70"
            >
              <KeyRound className="size-4" aria-hidden />
              Vorschau beenden
            </button>
          ) : (
            <>
              <label className="block min-w-[10rem] flex-1 space-y-1.5">
                <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                  Eltern-PIN (Vorschau)
                </span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
                  placeholder="PIN"
                />
              </label>
              <button
                type="button"
                disabled={isPending || pin.length < 4}
                onClick={handleUnlockPreview}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-4 py-3 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-70"
              >
                Vorschau freischalten
              </button>
            </>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {Array.from({ length: ADVENT_DAY_COUNT }, (_, index) => {
          const dayNumber = index + 1;
          const meta = dayMap.get(dayNumber);
          const ready = Boolean(meta?.hasStory);
          const openByDate = isAdventDoorOpen(dayNumber, book.year);
          const canPeek = previewActive || openByDate;
          const selected = selectedDay === dayNumber;

          return (
            <li key={dayNumber}>
              <button
                type="button"
                disabled={!ready || isPending}
                onClick={() => openDay(dayNumber)}
                title={
                  ready
                    ? canPeek
                      ? (meta?.title ?? `Tür ${dayNumber}`)
                      : `Öffnet am ${formatDeDate(adventUnlockDateIso(dayNumber, book.year))}`
                    : "Noch nicht erzeugt"
                }
                className={cn(
                  "relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl text-lg font-extrabold transition-all duration-200 ease-in-out ring-1",
                  selected
                    ? "bg-orange-700 text-white ring-orange-700"
                    : canPeek && ready
                      ? "bg-yellow-400 text-zinc-950 ring-yellow-400 hover:bg-yellow-300"
                      : ready
                        ? "bg-white text-zinc-500 ring-zinc-950/10"
                        : "bg-gray-100 text-zinc-400 ring-zinc-950/5",
                )}
              >
                <span>{dayNumber}</span>
                {!canPeek && ready ? (
                  <Lock className="mt-1 size-3.5 opacity-70" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {isPending && selectedDay && generateProgress === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-[1.75rem] bg-white p-8 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
          <Loader2 className="size-5 animate-spin text-orange-700" />
          Tür {selectedDay} wird geladen …
        </div>
      ) : null}

      {lockedMessage ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {storyTitle ? `${storyTitle}. ` : null}
          {lockedMessage}
        </p>
      ) : null}

      {storyHtml ? (
        <StoryResultPanel
          storyHtml={storyHtml}
          facts={facts}
          schoolStage={book.schoolStage}
          readableAloud={allowVorlesen && readableAloud}
          wordHighlight={allowMarkierung && wordHighlight}
          allowPdfExport={allowPdf}
          allowFactWhy={allowFactWhy}
          allowFactWhyMore={allowFactWhyMore}
          allowReadingMode={allowReadingMode}
          readingProfileId={book.childProfileId}
          readingModePrefs={readingModePrefs}
          typographyDefaults={typographyDefaults}
          eyebrow={storyTitle ?? `Tür ${selectedDay}`}
          onClose={() => {
            setStoryHtml(null);
            setSelectedDay(null);
          }}
        />
      ) : null}
    </div>
  );
}

function formatDeDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
