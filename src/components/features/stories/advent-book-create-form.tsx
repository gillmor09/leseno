"use client";

/**
 * Ultimate: create Advent calendar book + sequential day generation with progress.
 * Confirm before charging credits; blocking wait dialog while 24 days generate.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createAdventBookAction,
  generateAdventDayAction,
} from "@/app/actions/advent";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { useMembershipCredits } from "@/components/features/membership/membership-credits-header";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ADVENT_DAY_COUNT } from "@/lib/stories/advent";
import { adventBookCreditsForLength } from "@/lib/stories/credits-cost";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  STORY_TOPIC_MIX_PATTERNS,
  STORY_TOPIC_VISIBLE_COUNT,
  coerceStoryTopicForSchoolStage,
  defaultStoryTopicForSchoolStage,
  storyTopicsForSchoolStage,
  visibleStoryTopicsForSchoolStage,
  type StoryMoodId,
  type StorySchoolStageId,
  type StoryTopTopic,
  type StoryTopicMixPatternId,
} from "@/lib/stories/options";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

export function AdventBookCreateForm({
  lengthCatalog,
  childProfiles,
  enabledFeatures,
  onCreditsChange,
}: {
  lengthCatalog: StoryLengthCatalog;
  childProfiles: ChildProfileOption[] | null;
  enabledFeatures: readonly PackageFeatureId[];
  onCreditsChange?: (credits: number) => void;
}) {
  const router = useRouter();
  const botGuard = useBotGuardFields();
  const creditsCtx = useMembershipCredits();
  const reportCredits = onCreditsChange ?? creditsCtx?.onCreditsChange;
  const allowMeineWelt = featuresInclude(enabledFeatures, "meine_welt");
  const allowBilder = featuresInclude(enabledFeatures, "bilder");
  const allowSilben = featuresInclude(enabledFeatures, "silbenmethode");
  const allowMehrTiefgang = featuresInclude(enabledFeatures, "mehr_tiefgang");

  const [personalMode, setPersonalMode] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(
    childProfiles?.[0]?.id ?? null,
  );
  const [topic, setTopic] = useState<StoryTopTopic>(() =>
    defaultStoryTopicForSchoolStage("klasse_3"),
  );
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [topicsSecondaryExpanded, setTopicsSecondaryExpanded] =
    useState(false);
  const [topicSecondary, setTopicSecondary] = useState<StoryTopTopic | null>(
    null,
  );
  const [topicMixPattern, setTopicMixPattern] =
    useState<StoryTopicMixPatternId | null>(null);
  const [mehrTiefgang, setMehrTiefgang] = useState(false);
  const [schoolStage, setSchoolStage] =
    useState<StorySchoolStageId>("klasse_3");
  const [lengthStep, setLengthStep] =
    useState<StoryLengthStepId>("mittel");
  const [mood, setMood] = useState<StoryMoodId>("spannend");
  const [includeImages, setIncludeImages] = useState(false);
  const [syllableHelp, setSyllableHelp] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [isPending, startTransition] = useTransition();

  const creditCost = useMemo(
    () => adventBookCreditsForLength(lengthStep),
    [lengthStep],
  );

  useEffect(() => {
    if (topicSecondary && topicSecondary === topic) {
      setTopicSecondary(null);
      setTopicMixPattern(null);
    }
  }, [topic, topicSecondary]);

  function validateBeforeConfirm(): string | null {
    if (!/^\d{4,8}$/.test(pin.trim())) {
      return "PIN: bitte 4 bis 8 Ziffern eingeben.";
    }
    if (pin.trim() !== pinConfirm.trim()) {
      return "Die PIN-Wiederholung stimmt nicht.";
    }
    if (personalMode && allowMeineWelt && !profileId) {
      return "Bitte wähl ein Kinder-Profil.";
    }
    if (!personalMode && !topic) {
      return "Bitte wähl ein Thema.";
    }
    if (!personalMode && mehrTiefgang && topicSecondary) {
      if (topicSecondary === topic) {
        return "Haupt- und Nebenthema müssen verschieden sein.";
      }
      if (!topicMixPattern) {
        return "Bitte wähl, wie die Themen gemischt werden.";
      }
    }
    return null;
  }

  function handleRequestCreate() {
    const error = validateBeforeConfirm();
    if (error) {
      toast.error(error);
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmCreate() {
    setConfirmOpen(false);
    setWaitingOpen(true);
    setProgressDay(0);
    startTransition(async () => {
      const create = await createAdventBookAction({
        personalMode: personalMode && allowMeineWelt,
        profileId:
          personalMode && allowMeineWelt
            ? (profileId ?? undefined)
            : undefined,
        topic: personalMode ? undefined : topic,
        topicSecondary:
          personalMode || !mehrTiefgang || !topicSecondary
            ? undefined
            : topicSecondary,
        topicMixPattern:
          personalMode ||
          !mehrTiefgang ||
          !topicSecondary ||
          !topicMixPattern
            ? undefined
            : topicMixPattern,
        schoolStage,
        lengthStep,
        mood,
        includeImages: allowBilder && includeImages,
        syllableHelp: allowSilben && syllableHelp,
        conflictDepth: allowMehrTiefgang && mehrTiefgang,
        pin,
        pinConfirm,
        ...botGuard.getBotGuardPayload(),
      });

      if (!create.success || !create.data) {
        setWaitingOpen(false);
        setProgressDay(0);
        toast.error(create.error ?? "Anlegen fehlgeschlagen.");
        return;
      }

      if (
        typeof create.data.creditsRemaining === "number" &&
        reportCredits
      ) {
        reportCredits(create.data.creditsRemaining);
      }

      const bookId = create.data.bookId;

      for (let day = 1; day <= ADVENT_DAY_COUNT; day += 1) {
        setProgressDay(day);
        const dayResult = await generateAdventDayAction({
          bookId,
          dayNumber: day,
          ...botGuard.getBotGuardPayload(),
        });
        if (!dayResult.success) {
          setWaitingOpen(false);
          setProgressDay(0);
          toast.error(
            dayResult.error ??
              `Tag ${day} fehlgeschlagen. Du kannst später erneut versuchen.`,
          );
          router.push(`/adventskalender/${bookId}`);
          return;
        }
      }

      toast.success("Alle 24 Adventstage sind fertig!");
      router.push(`/adventskalender/${bookId}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />

      <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
        Ultimate · Adventskalenderbuch
      </p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950">
        24 Tage, eine Geschichte
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Es entstehen 24 aufeinander aufbauende Kapitel. Jede Tür öffnet sich
        erst am jeweiligen Dezember-Tag (Europe/Berlin). Mit deiner PIN kannst
        du als Elternteil die Vorschau für alle Tage freischalten.
      </p>

      <div className="mt-6 space-y-5">
        {allowMeineWelt && childProfiles && childProfiles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPersonalMode(false)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-bold ring-1",
                !personalMode
                  ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                  : "bg-white text-zinc-700 ring-zinc-950/10",
              )}
            >
              Freies Thema
            </button>
            <button
              type="button"
              onClick={() => {
                setPersonalMode(true);
                setTopicSecondary(null);
                setTopicMixPattern(null);
              }}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-bold ring-1",
                personalMode
                  ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                  : "bg-white text-zinc-700 ring-zinc-950/10",
              )}
            >
              Ganz persönlich
            </button>
          </div>
        ) : null}

        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Schulstufe
          </span>
          <select
            value={schoolStage}
            onChange={(event) => {
              const next = event.target.value as StorySchoolStageId;
              setSchoolStage(next);
              setTopic((current) =>
                coerceStoryTopicForSchoolStage(current, next),
              );
              setTopicSecondary((current) =>
                current
                  ? coerceStoryTopicForSchoolStage(current, next)
                  : null,
              );
              setTopicsExpanded(false);
              setTopicsSecondaryExpanded(false);
            }}
            disabled={personalMode}
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10 disabled:opacity-60"
          >
            {STORY_SCHOOL_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>

        {personalMode && childProfiles ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Kinder-Profil
            </span>
            <select
              value={profileId ?? ""}
              onChange={(event) =>
                setProfileId(event.target.value || null)
              }
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            >
              {childProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName || "Ohne Namen"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                Hauptthema
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Schauplatz oder Plot für alle 24 Tage.
              </p>
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Hauptthema"
              >
                {visibleStoryTopicsForSchoolStage(schoolStage, {
                  expanded: topicsExpanded,
                  selected: topic,
                }).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setTopic(item);
                      if (topicSecondary === item) {
                        setTopicSecondary(null);
                        setTopicMixPattern(null);
                      }
                    }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                      topic === item
                        ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                        : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                    )}
                  >
                    {item}
                  </button>
                ))}
                {storyTopicsForSchoolStage(schoolStage).length >
                STORY_TOPIC_VISIBLE_COUNT ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setTopicsExpanded((open) => !open)}
                    className="rounded-full px-3 py-1.5 text-sm font-bold text-orange-800 ring-1 ring-orange-700/20 transition-all duration-200 ease-in-out hover:bg-orange-50"
                    aria-expanded={topicsExpanded}
                  >
                    {topicsExpanded ? "Weniger" : "Mehr"}
                  </button>
                ) : null}
              </div>
            </div>

            {allowMehrTiefgang ? (
              <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-zinc-950/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                      Mehr Tiefgang
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      Realistische Konflikte und optional ein Nebenthema für alle
                      24 Tage.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={mehrTiefgang}
                    onCheckedChange={(checked) => {
                      setMehrTiefgang(checked);
                      if (!checked) {
                        setTopicSecondary(null);
                        setTopicMixPattern(null);
                        setTopicsSecondaryExpanded(false);
                      }
                    }}
                    disabled={isPending}
                    aria-label="Mehr Tiefgang"
                  />
                </div>

                {mehrTiefgang ? (
                  <div className="mt-4 space-y-3 border-t border-zinc-200/80 pt-4">
                    <div>
                      <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                        Nebenthema
                      </p>
                      <div
                        className="mt-3 flex flex-wrap gap-2"
                        role="group"
                        aria-label="Nebenthema"
                      >
                        {visibleStoryTopicsForSchoolStage(schoolStage, {
                          expanded: topicsSecondaryExpanded,
                          selected: topicSecondary ?? undefined,
                        })
                          .filter((item) => item !== topic)
                          .map((item) => (
                            <button
                              key={item}
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                setTopicSecondary((current) => {
                                  if (current === item) {
                                    setTopicMixPattern(null);
                                    return null;
                                  }
                                  if (!topicMixPattern) {
                                    setTopicMixPattern("crossover");
                                  }
                                  return item;
                                });
                              }}
                              className={cn(
                                "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                                topicSecondary === item
                                  ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                                  : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        {storyTopicsForSchoolStage(schoolStage).length >
                        STORY_TOPIC_VISIBLE_COUNT ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              setTopicsSecondaryExpanded((open) => !open)
                            }
                            className="rounded-full px-3 py-1.5 text-sm font-bold text-orange-800 ring-1 ring-orange-700/20 transition-all duration-200 ease-in-out hover:bg-orange-50"
                            aria-expanded={topicsSecondaryExpanded}
                          >
                            {topicsSecondaryExpanded ? "Weniger" : "Mehr"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {topicSecondary ? (
                      <div>
                        <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                          So mischen
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Wie sollen die beiden Themen in allen 24 Tagen
                          zusammenkommen?
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {STORY_TOPIC_MIX_PATTERNS.map((pattern) => {
                            const active = topicMixPattern === pattern.id;
                            return (
                              <button
                                key={pattern.id}
                                type="button"
                                disabled={isPending}
                                onClick={() => setTopicMixPattern(pattern.id)}
                                className={cn(
                                  "rounded-xl px-3 py-2.5 text-left ring-1 transition-all duration-200 ease-in-out",
                                  active
                                    ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                                    : "bg-gray-100 text-zinc-950 ring-zinc-950/10 hover:bg-white",
                                )}
                              >
                                <span className="block text-xs font-extrabold">
                                  {pattern.label}
                                  <span className="ml-1 font-semibold opacity-70">
                                    · {pattern.shortLabel}
                                  </span>
                                </span>
                                <span
                                  className={cn(
                                    "mt-1 block text-[11px] leading-snug font-medium",
                                    active ? "text-zinc-800" : "text-zinc-600",
                                  )}
                                >
                                  {pattern.principle}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Textlänge (pro Tag)
          </p>
          <StoryLengthSlider
            catalog={lengthCatalog}
            value={lengthStep}
            onChange={setLengthStep}
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Art der Geschichte
          </span>
          <select
            value={mood}
            onChange={(event) => setMood(event.target.value as StoryMoodId)}
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
          >
            {STORY_MOODS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Eltern-PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="4–8 Ziffern"
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              PIN wiederholen
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pinConfirm}
              onChange={(event) => setPinConfirm(event.target.value)}
              placeholder="Nochmals PIN"
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            />
          </label>
        </div>

        {allowMehrTiefgang && personalMode ? (
          <div className="flex items-start justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-zinc-950/5">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                Mehr Tiefgang
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Realistische Konflikte — Emotionen und Kompromisse bleiben über
                die 24 Tage spürbar.
              </p>
            </div>
            <ToggleSwitch
              checked={mehrTiefgang}
              onCheckedChange={setMehrTiefgang}
              disabled={isPending}
              aria-label="Mehr Tiefgang"
            />
          </div>
        ) : null}

        {(allowBilder || allowSilben) && (
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-zinc-700">
            {allowBilder ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(event) => setIncludeImages(event.target.checked)}
                />
                Bilder (macht die Erzeugung deutlich länger)
              </label>
            ) : null}
            {allowSilben ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={syllableHelp}
                  onChange={(event) => setSyllableHelp(event.target.checked)}
                />
                Silbenhilfe
              </label>
            ) : null}
          </div>
        )}

        <p className="text-sm font-semibold text-zinc-600">
          Kosten:{" "}
          <span className="tabular-nums text-zinc-950">
            {creditCost.toLocaleString("de-DE")} Credits
          </span>{" "}
          (24 × gewählte Länge)
        </p>

        <button
          type="button"
          disabled={isPending}
          onClick={handleRequestCreate}
          className="inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3.5 text-sm font-extrabold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70 sm:w-auto"
        >
          Adventskalenderbuch erzeugen
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Adventskalenderbuch erzeugen?"
        description={`Es werden ${creditCost.toLocaleString("de-DE")} Credits abgebucht und 24 aufeinander aufbauende Geschichten erzeugt. Das kann mehrere Minuten dauern. Bitte das Fenster danach nicht schließen.`}
        confirmLabel="Jetzt erzeugen"
        pending={false}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmCreate}
      />

      <AdventWaitingDialog open={waitingOpen} progressDay={progressDay} />
    </div>
  );
}

/** Blocking overlay while the 24 Advent days are generated. */
function AdventWaitingDialog({
  open,
  progressDay,
}: {
  open: boolean;
  progressDay: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const percent =
    progressDay <= 0
      ? 2
      : Math.min(100, Math.round((progressDay / ADVENT_DAY_COUNT) * 100));

  const statusText =
    progressDay === 0
      ? "Buch wird angelegt und Credits werden abgebucht …"
      : `Tag ${progressDay} von ${ADVENT_DAY_COUNT} wird geschrieben …`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="advent-wait-title"
      aria-describedby="advent-wait-desc"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex items-start gap-3">
          <Loader2
            className="mt-0.5 size-6 shrink-0 animate-spin text-orange-700"
            aria-hidden
          />
          <div className="min-w-0">
            <h2
              id="advent-wait-title"
              className="text-xl font-extrabold text-zinc-950"
            >
              Adventskalenderbuch entsteht
            </h2>
            <p
              id="advent-wait-desc"
              className="mt-2 text-sm leading-relaxed text-zinc-600"
            >
              {statusText} Bitte warte und schließe dieses Fenster nicht.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 ring-1 ring-zinc-950/10">
            <div
              className="h-full rounded-full bg-orange-700 transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-bold tabular-nums text-zinc-500">
            {progressDay > 0
              ? `${progressDay} / ${ADVENT_DAY_COUNT} Tage`
              : "Start …"}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
