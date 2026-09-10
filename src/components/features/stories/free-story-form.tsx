"use client";

/**
 * Free-tier story form: Freies lesen (topic + school) or profile-driven personal story.
 * Full-screen wait overlay while generating; selection card collapses when ready.
 * Result UI (TTS / PDF / facts) lives in `StoryResultPanel`.
 */

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  BicepsFlexed,
  ChevronDown,
  Loader2,
  Smile,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { generateFreeStoryAction, pollFreeStoryGenerateJobAction, startFreeStoryGenerateJobAction } from "@/app/actions/story-generate";
import type { StoryPipelineProgressEvent } from "@/lib/ai/pipeline-progress";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { trackUserActivity } from "@/lib/users/track-client";
import { cn } from "@/lib/utils";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import { StoryResultPanel } from "@/components/features/stories/story-result-panel";
import { ChildProfilePickerCard } from "@/components/features/stories/child-profile-picker-card";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { FREE_READING_EXTRAS } from "@/lib/world/catalog";
import {
  STORY_SCHOOL_STAGES,
  STORY_MOODS,
  STORY_TOPIC_MIX_PATTERNS,
  STORY_TOPIC_VISIBLE_COUNT,
  coerceStoryTopicForSchoolStage,
  defaultStoryTopicForSchoolStage,
  formatStoryTopicMixLabel,
  storyTopicsForSchoolStage,
  visibleStoryTopicsForSchoolStage,
  type StoryMoodId,
  type StorySchoolStageId,
  type StoryTopTopic,
  type StoryTopicMixPatternId,
} from "@/lib/stories/options";
import {
  TRIAL_ALLOWED_SCHOOL_STAGES,
  TRIAL_DEFAULT_LENGTH_STEP,
  TRIAL_DEFAULT_SCHOOL_STAGE,
  TRIAL_DISABLED_LENGTH_STEPS,
} from "@/lib/stories/trial-limits";
import { storyCreditsForLength } from "@/lib/stories/credits-cost";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";

const moodIcons = {
  lustig: Smile,
  spannend: Zap,
  motivierend: BicepsFlexed,
} as const;

/**
 * Controlled composer for `/geschichte` and `/kostenlos` trial.
 * Collects inputs and fills the output pane via `generateFreeStoryAction`.
 * Membership features come from `enabledFeatures` (package catalog).
 */
export function FreeStoryForm({
  lengthCatalog,
  typographyDefaults,
  childProfiles = null,
  trialMode = false,
  enabledFeatures = [],
  initialCredits = 0,
  onCreditsChange,
  inviteUserId = null,
  initialUnlockedProfileIds = [],
  isAdmin = false,
  childSessionLockedProfileId = null,
}: {
  lengthCatalog: StoryLengthCatalog;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  /**
   * Signed-in child profiles for the picker card (null = guest / hide card).
   * Selecting a ready profile starts a personal story from that world.
   */
  childProfiles?: ChildProfileOption[] | null;
  /** Public `/kostenlos` limits: grades, length, no TTS/PDF/images, IP quota. */
  trialMode?: boolean;
  /** Package feature flags from `membership_packages` (ignored in trialMode). */
  enabledFeatures?: readonly PackageFeatureId[];
  /** Current credits balance (membership only; ignored in trialMode). */
  initialCredits?: number;
  /** Called after a successful paid story generation with the new balance. */
  onCreditsChange?: (credits: number) => void;
  /** Personal invite `?ref=` after a story (membership). */
  inviteUserId?: string | null;
  /** @deprecated PIN unlock removed; all ids are usable. */
  initialUnlockedProfileIds?: string[];
  /** Admin wait overlay shows live pipeline model/stage. */
  isAdmin?: boolean;
  /**
   * When set (child cookie login), only this profile may be used — no Freies
   * lesen switch, no Meine-Welt editing.
   */
  childSessionLockedProfileId?: string | null;
}) {
  const canFeature = (feature: PackageFeatureId) =>
    !trialMode && featuresInclude(enabledFeatures, feature);

  const lockedChildProfile =
    childSessionLockedProfileId && childProfiles
      ? (childProfiles.find(
          (profile) => profile.id === childSessionLockedProfileId,
        ) ?? null)
      : null;

  const startupProfile = trialMode
    ? null
    : (lockedChildProfile ??
      childProfiles?.find(
        (profile) => profile.isDefault && profile.personalReady,
      ) ??
      null);

  const [schoolStage, setSchoolStage] = useState<StorySchoolStageId>(
    trialMode
      ? TRIAL_DEFAULT_SCHOOL_STAGE
      : (startupProfile?.schoolStage ?? "klasse_3"),
  );
  const [topic, setTopic] = useState<StoryTopTopic>(() =>
    defaultStoryTopicForSchoolStage(
      trialMode
        ? TRIAL_DEFAULT_SCHOOL_STAGE
        : (startupProfile?.schoolStage ?? "klasse_3"),
    ),
  );
  const [mehrTiefgang, setMehrTiefgang] = useState(false);
  const [topicSecondary, setTopicSecondary] = useState<StoryTopTopic | null>(
    null,
  );
  const [topicMixPattern, setTopicMixPattern] =
    useState<StoryTopicMixPatternId | null>(null);
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [topicsSecondaryExpanded, setTopicsSecondaryExpanded] = useState(false);
  /** Optional Nebenthema; when set, a mix pattern is required. */
  /** `null` = Freies lesen (fallback). Default profile wins when ready. */
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    startupProfile?.id ?? lockedChildProfile?.id ?? null,
  );
  const [unlockedIds] = useState(
    () => new Set(initialUnlockedProfileIds),
  );
  const [lengthStep, setLengthStep] = useState<StoryLengthStepId>(
    trialMode
      ? TRIAL_DEFAULT_LENGTH_STEP
      : (startupProfile?.lengthStep ?? "mittel"),
  );
  const [mood, setMood] = useState<StoryMoodId>(
    startupProfile?.mood ?? "spannend",
  );
  const [output, setOutput] = useState("");
  const [learnedFacts, setLearnedFacts] = useState<string[]>([]);
  const [libraryStoryId, setLibraryStoryId] = useState<string | null>(null);
  const [storySchoolStage, setStorySchoolStage] =
    useState<StorySchoolStageId | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] =
    useState<StoryPipelineProgressEvent | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [selectionExpanded, setSelectionExpanded] = useState(true);
  const [profileGapDialog, setProfileGapDialog] = useState<{
    displayName: string;
    missingName: boolean;
    missingTopics: boolean;
  } | null>(null);
  /** When a profile is selected: length/mood cards hidden until „ändern“. */
  const [lengthMoodOpen, setLengthMoodOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();
  const [profiles, setProfiles] = useState(childProfiles);

  useEffect(() => {
    setProfiles(childProfiles);
  }, [childProfiles]);

  useEffect(() => {
    if (topicSecondary && topicSecondary === topic) {
      setTopicSecondary(null);
      setTopicMixPattern(null);
    }
  }, [topic, topicSecondary]);

  const selectedProfile =
    selectedProfileId == null
      ? null
      : (profiles?.find((profile) => profile.id === selectedProfileId) ??
        null);
  const activeProfileId = selectedProfile?.id ?? null;
  /** Profile selection drives personal stories (no separate toggle). */
  const personalMode = Boolean(selectedProfile);
  const includeImages =
    canFeature("bilder") &&
    (selectedProfile?.includeImages ?? FREE_READING_EXTRAS.includeImages);
  const syllableHelp =
    canFeature("silbenmethode") &&
    (selectedProfile?.syllableHelp ?? FREE_READING_EXTRAS.syllableHelp);
  const wordHighlight =
    canFeature("markierung") &&
    (selectedProfile?.wordHighlight ?? FREE_READING_EXTRAS.wordHighlight);
  const readableAloud =
    canFeature("vorlesen") &&
    (selectedProfile?.readableAloud ?? FREE_READING_EXTRAS.readableAloud);
  const allowMehrTiefgang = canFeature("mehr_tiefgang");
  const allowPdfExport = canFeature("export");
  const allowFactWhy = canFeature("warum");
  const allowFactWhyMore = canFeature("hintergrund");
  const allowReadingMode = canFeature("lesemodus");
  const allowContinue = canFeature("fortsetzen") && canFeature("buecherei");
  const storyCreditCost = trialMode
    ? 0
    : storyCreditsForLength(lengthStep);
  const hasEnoughCredits = trialMode || initialCredits >= storyCreditCost;

  useEffect(() => {
    if (!isPending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setLearnedFacts([]);
    setStorySchoolStage(null);

    if (personalMode && !activeProfileId) {
      setFieldError("Bitte wähl ein Kinder-Profil.");
      toast.error("Bitte wähl ein Kinder-Profil.");
      return;
    }

    if (!personalMode && !topic) {
      setFieldError("Bitte wähl ein Thema.");
      toast.error("Bitte wähl ein Thema.");
      return;
    }

    if (!personalMode && mehrTiefgang && topicSecondary) {
      if (topicSecondary === topic) {
        setFieldError("Haupt- und Nebenthema müssen verschieden sein.");
        toast.error("Haupt- und Nebenthema müssen verschieden sein.");
        return;
      }
      if (!topicMixPattern) {
        setFieldError("Bitte wähl, wie die Themen gemischt werden.");
        toast.error("Bitte wähl, wie die Themen gemischt werden.");
        return;
      }
    }

    if (!trialMode && !hasEnoughCredits) {
      setFieldError(
        `Für diese Länge brauchst du ${storyCreditCost} Credits. Du hast ${initialCredits.toLocaleString("de-DE")}.`,
      );
      toast.error("Nicht genug Credits für diese Geschichtenlänge.");
      return;
    }

    setStatusText(
      personalMode
        ? "Ich hole spannendes Wissen aus deiner Welt …"
        : "Ich hole spannendes Wissen für dich …",
    );
    setPipelineProgress(null);

    trackUserActivity({
      action: "story.generate_click",
      label: "Klick: Geschichte erzeugen",
      metadata: {
        personalMode,
        topic: personalMode ? null : topic,
        topicSecondary:
          personalMode || !mehrTiefgang ? null : topicSecondary,
        topicMixPattern:
          personalMode || !mehrTiefgang ? null : topicMixPattern,
        profileId: activeProfileId,
        lengthStep,
        mood,
        schoolStage,
      },
    });

    const generatePayload = {
      personalMode: trialMode ? false : personalMode,
      profileId:
        trialMode || !personalMode
          ? undefined
          : (activeProfileId ?? undefined),
      syllableHelp,
      includeImages,
      trialMode,
      conflictDepth: allowMehrTiefgang && mehrTiefgang,
      topic: trialMode || !personalMode ? topic : undefined,
      topicSecondary:
        trialMode || !personalMode
          ? mehrTiefgang && topicSecondary
            ? topicSecondary
            : undefined
          : undefined,
      topicMixPattern:
        trialMode || !personalMode
          ? mehrTiefgang && topicSecondary && topicMixPattern
            ? topicMixPattern
            : undefined
          : undefined,
      schoolStage,
      lengthStep,
      mood,
      ...botGuard.getBotGuardPayload(),
    };

    function applySuccess(data: NonNullable<
      Awaited<ReturnType<typeof generateFreeStoryAction>>["data"]
    >) {
      setStatusText(null);
      setPipelineProgress(null);
      setOutput(data.story);
      setLearnedFacts(
        data.facts
          .map((fact) => (typeof fact === "string" ? fact.trim() : ""))
          .filter(Boolean),
      );
      setStorySchoolStage(schoolStage);
      setLibraryStoryId(data.libraryStoryId ?? null);
      setSelectionExpanded(false);
      if (data.personalSeed) {
        const seed = data.personalSeed;
        const sourceLabel =
          seed.seedSource === "experience"
            ? "Erlebniswunsch"
            : "Interesse";
        toast.success(
          `Geschichte ist da — Kern (${sourceLabel}): ${seed.topic}`,
        );
      } else {
        toast.success("Geschichte ist da!");
      }
      if (typeof data.creditsRemaining === "number" && onCreditsChange) {
        onCreditsChange(data.creditsRemaining);
      }
    }

    function applyFailure(message: string) {
      setStatusText(null);
      setPipelineProgress(null);
      setFieldError(message);
      toast.error(message);
      setSelectionExpanded(true);
    }

    startTransition(async () => {
      setLibraryStoryId(null);

      if (isAdmin && !trialMode) {
        const started = await startFreeStoryGenerateJobAction(generatePayload);
        if (!started.success || !started.data?.jobId) {
          applyFailure(
            started.error ?? "Deine Geschichte konnte nicht entstehen.",
          );
          return;
        }

        const jobId = started.data.jobId;
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          const polled = await pollFreeStoryGenerateJobAction(jobId);
          if (!polled.success || !polled.data) {
            applyFailure(
              polled.error ?? "Deine Geschichte konnte nicht entstehen.",
            );
            return;
          }

          if (polled.data.progress) {
            setPipelineProgress(polled.data.progress);
            setStatusText(polled.data.progress.label);
          }

          if (polled.data.status === "done" && polled.data.data) {
            applySuccess(polled.data.data);
            return;
          }

          if (polled.data.status === "error") {
            applyFailure(
              polled.data.error ??
                "Deine Geschichte konnte nicht entstehen.",
            );
            return;
          }
        }
      }

      const result = await generateFreeStoryAction(generatePayload);

      if (!result.success || !result.data) {
        applyFailure(
          result.error ?? "Deine Geschichte konnte nicht entstehen.",
        );
        return;
      }

      applySuccess(result.data);
    });
  }

  const hasStory = Boolean(output) && !isPending;
  const selectionCollapsed = hasStory && !selectionExpanded;
  const summaryTopic = personalMode
    ? `Persönlich (${selectedProfile?.displayName ?? "Profil"})`
    : mehrTiefgang && topicSecondary
      ? formatStoryTopicMixLabel(topic, topicSecondary)
      : topic || "Thema";
  const summaryStage =
    STORY_SCHOOL_STAGES.find((stage) => stage.id === schoolStage)?.label ??
    schoolStage;
  const summaryMood =
    STORY_MOODS.find((item) => item.id === mood)?.label ?? mood;
  const summaryExtras = [
    personalMode
      ? null
      : childProfiles !== null
        ? "Freies lesen"
        : null,
    summaryStage,
    summaryMood,
    includeImages ? "Mit Bildern" : null,
    mehrTiefgang ? "Mehr Tiefgang" : null,
    syllableHelp ? "Silbenhilfe" : null,
    wordHighlight ? "Wort-Markierung" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectionCardClass =
    "rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8";

  function applyProfileSelect(profileId: string) {
    const next = profiles?.find((profile) => profile.id === profileId);
    if (!next) return;
    if (!next.personalReady) {
      setProfileGapDialog({
        displayName: next.displayName,
        missingName: !next.hasName,
        missingTopics: !next.hasTopicSeeds,
      });
      return;
    }
    setSelectedProfileId(profileId);
    setSchoolStage(next.schoolStage);
    setLengthStep(next.lengthStep);
    setMood(next.mood);
    setLengthMoodOpen(false);
    trackUserActivity({
      action: "story.profile_select",
      label: "Leser ausgewählt",
      metadata: { profileId, displayName: next.displayName },
    });
  }

  function handleProfileSelect(profileId: string | null) {
    if (childSessionLockedProfileId) {
      return;
    }
    if (profileId === null) {
      setSelectedProfileId(null);
      setLengthMoodOpen(false);
      if (!topic) setTopic(defaultStoryTopicForSchoolStage(schoolStage));
      trackUserActivity({
        action: "story.profile_select",
        label: "Leser: Freies lesen",
        metadata: { profileId: null },
      });
      return;
    }
    const next = profiles?.find((profile) => profile.id === profileId);
    if (!next) return;
    applyProfileSelect(profileId);
  }

  return (
    <div className="grid min-w-0 max-w-full items-start gap-8">
      {childProfiles !== null && !trialMode && !selectionCollapsed ? (
        <ChildProfilePickerCard
          profiles={
            lockedChildProfile
              ? [lockedChildProfile]
              : (profiles ?? [])
          }
          selectedId={selectedProfileId}
          unlockedIds={unlockedIds}
          onSelect={handleProfileSelect}
          disabled={isPending || Boolean(childSessionLockedProfileId)}
          hideFreeReading={Boolean(childSessionLockedProfileId)}
          lengthLabel={
            personalMode
              ? (lengthCatalog.steps.find((step) => step.id === lengthStep)
                  ?.label ?? lengthStep)
              : null
          }
          moodLabel={
            personalMode
              ? (STORY_MOODS.find((item) => item.id === mood)?.label ?? mood)
              : null
          }
          lengthMoodOpen={lengthMoodOpen}
          onToggleLengthMood={
            personalMode
              ? () => setLengthMoodOpen((open) => !open)
              : undefined
          }
        />
      ) : null}

      {profileGapDialog
        ? createPortal(
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="profile-gap-title"
              aria-describedby="profile-gap-desc"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
              onClick={() => setProfileGapDialog(null)}
            >
              <div
                className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="profile-gap-title"
                    className="text-xl font-extrabold text-zinc-950"
                  >
                    Profil noch unvollständig
                  </h2>
                  <button
                    type="button"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950"
                    onClick={() => setProfileGapDialog(null)}
                  >
                    <X className="size-5" aria-hidden />
                    <span className="sr-only">Schließen</span>
                  </button>
                </div>
                <p
                  id="profile-gap-desc"
                  className="mt-3 text-sm leading-relaxed text-zinc-600"
                >
                  Für „{profileGapDialog.displayName}“ fehlen Angaben, damit
                  eine persönliche Geschichte entstehen kann:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                  {profileGapDialog.missingName ? (
                    <li>Name des Kindes</li>
                  ) : null}
                  {profileGapDialog.missingTopics ? (
                    <li>
                      Mindestens ein Interesse oder etwas unter „Das möchte ich
                      mal erleben“
                    </li>
                  ) : null}
                </ul>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <a
                    href="/meine-welt"
                    className="inline-flex items-center justify-center rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
                  >
                    In Meine Welt ergänzen
                  </a>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <form
        noValidate
        onSubmit={handleSubmit}
        className="grid gap-6"
      >
        <BotGuardFields
          website={botGuard.website}
          onWebsiteChange={botGuard.setWebsite}
          formStartedAt={botGuard.formStartedAt}
        />

        {selectionCollapsed ? (
          <div className={cn(selectionCardClass, "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between")}>
            <div>
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Deine Auswahl
              </p>
              <p className="mt-1 text-base font-bold text-zinc-950">
                {summaryTopic}
                <span className="font-semibold text-zinc-500">
                  {" "}
                  · {summaryExtras}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectionExpanded(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-white"
            >
              Auswahl ändern
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            {hasStory ? (
              <div className={cn(selectionCardClass, "flex items-center justify-between gap-3 py-4 sm:py-5")}>
                <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                  Auswahl
                </p>
                <button
                  type="button"
                  onClick={() => setSelectionExpanded(false)}
                  className="text-sm font-bold text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
                >
                  Einklappen
                </button>
              </div>
            ) : null}

            {!personalMode ? (
              <section className={selectionCardClass}>
                <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                  Schulstufe
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  So passen Sprache und Länge zu dem, was du schon gut lesen
                  kannst.
                </p>
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Schulstufe"
                >
                  {STORY_SCHOOL_STAGES.map((stage) => {
                    const allowed = trialMode
                      ? (TRIAL_ALLOWED_SCHOOL_STAGES as readonly string[]).includes(
                          stage.id,
                        )
                      : true;
                    return (
                      <ChoiceChip
                        key={stage.id}
                        active={schoolStage === stage.id}
                        disabled={!allowed}
                        onClick={() => {
                          setSchoolStage(stage.id);
                          setTopic((current) =>
                            coerceStoryTopicForSchoolStage(current, stage.id),
                          );
                          setTopicSecondary((current) => {
                            if (!current) return null;
                            const next = coerceStoryTopicForSchoolStage(
                              current,
                              stage.id,
                            );
                            return next;
                          });
                          setTopicsExpanded(false);
                          setTopicsSecondaryExpanded(false);
                        }}
                        label={stage.label}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}

            {!personalMode ? (
              <section className={selectionCardClass}>
                <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                  Hauptthema
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Schauplatz oder Plot für deine Geschichte.
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
                        trackUserActivity({
                          action: "story.topic_select",
                          label: "Hauptthema gewählt",
                          metadata: { topic: item, schoolStage },
                        });
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

                {allowMehrTiefgang ? (
                  <div className="mt-5 border-t border-zinc-100 pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                          Mehr Tiefgang
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Realistische Konflikte und optional ein Nebenthema —
                          Figuren vertragen sich nicht sofort, Emotionen bleiben
                          spürbar.
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
                      <>
                        <p className="mt-4 text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                          Nebenthema
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Optional: Figur, Fähigkeit oder Konflikt — maximal zwei
                          Themen.
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
                                  trackUserActivity({
                                    action: "story.topic_secondary_select",
                                    label: "Nebenthema gewählt",
                                    metadata: {
                                      topic,
                                      topicSecondary: item,
                                      schoolStage,
                                    },
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

                        {topicSecondary ? (
                          <div className="mt-5">
                            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                              So mischen
                            </p>
                            <p className="mt-1 text-sm text-zinc-600">
                              Wie sollen die beiden Themen in der Geschichte
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
                                    onClick={() => {
                                      setTopicMixPattern(pattern.id);
                                      trackUserActivity({
                                        action: "story.topic_mix_pattern",
                                        label: "Mix-Muster gewählt",
                                        metadata: {
                                          pattern: pattern.id,
                                          topic,
                                          topicSecondary,
                                        },
                                      });
                                    }}
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
                                        active
                                          ? "text-zinc-800"
                                          : "text-zinc-600",
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
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {!personalMode || lengthMoodOpen ? (
              <>
                <div className={selectionCardClass}>
                  {personalMode ? (
                    <p className="mb-4 text-xs font-semibold text-zinc-500">
                      Nur für diese Geschichte — Profil-Standard bleibt
                      unverändert.
                    </p>
                  ) : null}
                  <StoryLengthSlider
                    catalog={lengthCatalog}
                    value={lengthStep}
                    onChange={setLengthStep}
                    disabledStepIds={
                      trialMode ? TRIAL_DISABLED_LENGTH_STEPS : undefined
                    }
                  />
                </div>

                <section className={selectionCardClass}>
                  <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                    Art der Geschichte
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {STORY_MOODS.map((item) => {
                      const Icon = moodIcons[item.id];
                      const active = mood === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isPending}
                          onClick={() => setMood(item.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-extrabold ring-1 transition-all duration-200 ease-in-out",
                            active
                              ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                              : "bg-gray-100 text-zinc-950 ring-zinc-950/10 hover:bg-white",
                          )}
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-orange-700">
                            <Icon className="size-3.5" aria-hidden />
                          </span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {allowMehrTiefgang && personalMode ? (
                  <section className={selectionCardClass}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                          Mehr Tiefgang
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Realistische Konflikte: Figuren vertragen sich nicht
                          sofort — Emotionen bleiben spürbar.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={mehrTiefgang}
                        onCheckedChange={setMehrTiefgang}
                        disabled={isPending}
                        aria-label="Mehr Tiefgang"
                      />
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}

            {fieldError ? (
              <p className="text-sm font-semibold text-orange-800">
                {fieldError}
              </p>
            ) : null}

            {!trialMode ? (
              <p
                className={cn(
                  "text-center text-sm font-semibold",
                  hasEnoughCredits ? "text-zinc-600" : "text-orange-800",
                )}
              >
                Kosten:{" "}
                <span className="tabular-nums text-zinc-950">
                  {storyCreditCost} Credits
                </span>
                {!hasEnoughCredits
                  ? ` — du hast nur ${initialCredits.toLocaleString("de-DE")}`
                  : null}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending || (!trialMode && !hasEnoughCredits)}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
                (isPending || (!trialMode && !hasEnoughCredits)) &&
                  "opacity-70",
              )}
            >
              {isPending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-5" aria-hidden />
              )}
              {isPending
                ? "Deine Geschichte entsteht …"
                : hasStory
                  ? "Neue Geschichte starten"
                  : "Meine Geschichte starten"}
            </button>
          </>
        )}
      </form>

      {hasStory ? (
        <StoryResultPanel
          storyHtml={output}
          facts={learnedFacts}
          schoolStage={storySchoolStage ?? schoolStage}
          readableAloud={readableAloud}
          wordHighlight={wordHighlight}
          allowPdfExport={allowPdfExport}
          allowFactWhy={allowFactWhy}
          allowFactWhyMore={allowFactWhyMore}
          allowReadingMode={allowReadingMode}
          readingProfileId={activeProfileId}
          readingModePrefs={selectedProfile?.readingModePrefs ?? null}
          typographyDefaults={typographyDefaults}
          allowContinue={allowContinue}
          libraryStoryId={libraryStoryId}
          lengthCatalog={lengthCatalog}
          continueLengthStep={lengthStep}
          continueMood={mood}
          onContinued={(result) => {
            setOutput(result.storyHtml);
            setLearnedFacts(result.facts);
            setStorySchoolStage(result.schoolStage);
            setLibraryStoryId(result.libraryStoryId);
            if (
              typeof result.creditsRemaining === "number" &&
              onCreditsChange
            ) {
              onCreditsChange(result.creditsRemaining);
            }
          }}
          onReadingModePrefsChange={(prefs) => {
            if (!activeProfileId) return;
            setProfiles((current) =>
              current
                ? current.map((profile) =>
                    profile.id === activeProfileId
                      ? { ...profile, readingModePrefs: prefs }
                      : profile,
                  )
                : current,
            );
          }}
          inviteUserId={inviteUserId}
        />
      ) : null}

      {isPending ? (
        <StoryWaitOverlay
          statusText={statusText}
          includeImages={includeImages}
          adminProgress={isAdmin ? pipelineProgress : null}
        />
      ) : null}
    </div>
  );
}

/**
 * Full-screen wait dialog. Only mounts while pending (client-only interaction),
 * so `document.body` exists without a portalReady effect.
 * Admins additionally see the live pipeline model(s) for the current stage.
 */
function StoryWaitOverlay({
  statusText,
  includeImages,
  adminProgress,
}: {
  statusText: string | null;
  includeImages: boolean;
  adminProgress: StoryPipelineProgressEvent | null;
}) {
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="story-wait-title"
      aria-describedby="story-wait-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center shadow-2xl ring-1 ring-zinc-950/10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 ring-1 ring-orange-700/15">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </span>
        <h2
          id="story-wait-title"
          className="mt-5 text-xl font-extrabold text-zinc-950"
        >
          Deine Geschichte entsteht
        </h2>
        <p
          id="story-wait-desc"
          className="mt-2 text-sm font-semibold text-orange-900"
        >
          {statusText ??
            (includeImages
              ? "Ich schreibe und male für dich …"
              : "Ich schreibe deine Geschichte …")}
        </p>
        {adminProgress ? (
          <div className="mt-4 rounded-2xl bg-zinc-950/[0.04] px-4 py-3 text-left ring-1 ring-zinc-950/10">
            <p className="text-[0.65rem] font-extrabold tracking-wide text-zinc-500 uppercase">
              Admin · aktueller Schritt
            </p>
            <p className="mt-1 text-sm font-extrabold text-zinc-950">
              {adminProgress.label}
            </p>
            <ul className="mt-2 space-y-1.5">
              {adminProgress.models.map((model) => (
                <li
                  key={`${model.roleLabel}-${model.modelSlug}`}
                  className="text-xs leading-snug text-zinc-700"
                >
                  <span className="font-bold text-zinc-900">
                    {model.roleLabel}:
                  </span>{" "}
                  <span className="font-semibold">{model.modelSlug}</span>
                  <span className="text-zinc-500">
                    {" "}
                    · {model.provider}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            {includeImages
              ? "Zuerst hole ich Neues zum Staunen. Danach entstehen Geschichte und Bilder parallel — zum Schluss fließt der Text um die Bilder. Das kann einen Moment dauern."
              : "Zuerst hole ich Neues zum Staunen. Danach schreibe ich die Geschichte."}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ChoiceChip({
  active,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Im kostenlosen Test nicht verfügbar" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
        disabled &&
          "cursor-not-allowed bg-gray-50 text-zinc-300 ring-zinc-950/5",
        !disabled &&
          active &&
          "bg-yellow-400 text-zinc-950 ring-yellow-400",
        !disabled &&
          !active &&
          "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}
