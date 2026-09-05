"use client";

/**
 * Free-tier story form: Freies lesen (topic + school) or profile-driven personal story.
 * Full-screen wait overlay while generating; selection card collapses when ready.
 * PDF: html2pdf blob → large preview dialog → download.
 * Round play button: OpenAI TTS + Whisper word highlight (`synthesizeStorySpeechAction`).
 */

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  BicepsFlexed,
  ChevronDown,
  FileDown,
  Loader2,
  Pause,
  Play,
  Smile,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { generateFreeStoryAction } from "@/app/actions/story-generate";
import { synthesizeStorySpeechAction } from "@/app/actions/story-tts";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { trackUserActivity } from "@/lib/users/track-client";
import { cn } from "@/lib/utils";
import { StoryHtmlBody } from "@/components/features/stories/story-html-body";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  exportFontSizeForSchoolStage,
  buildStoryExportDocument,
  buildStoryPdfBlob,
} from "@/lib/stories/export-story-document";
import { StoryPdfPreviewDialog } from "@/components/features/stories/story-pdf-preview-dialog";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";
import { ChildProfilePickerCard } from "@/components/features/stories/child-profile-picker-card";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { FREE_READING_EXTRAS } from "@/lib/world/catalog";
import {
  STORY_SCHOOL_STAGES,
  STORY_MOODS,
  STORY_TOP_TOPICS,
  type StoryMoodId,
  type StorySchoolStageId,
  type StoryTopTopic,
} from "@/lib/stories/options";
import { plainTextFromStoryHtml } from "@/lib/stories/plain-text-from-html";
import {
  clearActiveTtsWord,
  createTtsMediaClock,
  findActiveWordIndex,
  readTtsMediaClock,
  reanchorTtsMediaClock,
  setActiveTtsWord,
  wrapStoryWordsForTts,
  type TtsMediaClock,
} from "@/lib/stories/tts-dom-highlight";
import type { StoryTtsWordTiming } from "@/app/actions/story-tts";
import {
  TRIAL_ALLOWED_SCHOOL_STAGES,
  TRIAL_DEFAULT_LENGTH_STEP,
  TRIAL_DEFAULT_SCHOOL_STAGE,
  TRIAL_DISABLED_LENGTH_STEPS,
} from "@/lib/stories/trial-limits";
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
  childProfiles = null,
  trialMode = false,
  enabledFeatures = [],
}: {
  lengthCatalog: StoryLengthCatalog;
  /**
   * Signed-in child profiles for the picker card (null = guest / hide card).
   * Selecting a ready profile starts a personal story from that world.
   */
  childProfiles?: ChildProfileOption[] | null;
  /** Public `/kostenlos` limits: grades, length, no TTS/PDF/images, IP quota. */
  trialMode?: boolean;
  /** Package feature flags from `membership_packages` (ignored in trialMode). */
  enabledFeatures?: readonly PackageFeatureId[];
}) {
  const canFeature = (feature: PackageFeatureId) =>
    !trialMode && featuresInclude(enabledFeatures, feature);

  const startupProfile = trialMode
    ? null
    : (childProfiles?.find(
        (profile) => profile.isDefault && profile.personalReady,
      ) ?? null);

  const [topic, setTopic] = useState<StoryTopTopic | "">(
    STORY_TOP_TOPICS[0],
  );
  /** `null` = Freies lesen (fallback). Default profile wins when ready. */
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    startupProfile?.id ?? null,
  );
  const [schoolStage, setSchoolStage] = useState<StorySchoolStageId>(
    trialMode
      ? TRIAL_DEFAULT_SCHOOL_STAGE
      : (startupProfile?.schoolStage ?? "klasse_3"),
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
  const [storySchoolStage, setStorySchoolStage] =
    useState<StorySchoolStageId | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [selectionExpanded, setSelectionExpanded] = useState(true);
  const [profileGapDialog, setProfileGapDialog] = useState<{
    displayName: string;
    missingName: boolean;
    missingTopics: boolean;
  } | null>(null);
  /** When a profile is selected: length/mood cards hidden until „ändern“. */
  const [lengthMoodOpen, setLengthMoodOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  /** Client playback rate 0.8…1.1 (live via audio.playbackRate, not re-TTS). */
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();
  const storyBodyRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<
    { url: string; words: StoryTtsWordTiming[] }[]
  >([]);
  const ttsObjectUrlsRef = useRef<string[]>([]);
  const ttsChunkWordsRef = useRef<StoryTtsWordTiming[]>([]);
  const ttsLastHighlightAtRef = useRef(0);
  const ttsMediaClockRef = useRef<TtsMediaClock>(createTtsMediaClock(1));
  const ttsRafRef = useRef<number | null>(null);
  const ttsSpeedRef = useRef(ttsSpeed);
  ttsSpeedRef.current = ttsSpeed;

  const selectedProfile =
    selectedProfileId == null
      ? null
      : (childProfiles?.find((profile) => profile.id === selectedProfileId) ??
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
  const allowPdfExport = canFeature("export");
  const allowFactWhy = canFeature("warum");
  const allowFactWhyMore = canFeature("hintergrund");

  const wordHighlightRef = useRef(wordHighlight);
  wordHighlightRef.current = wordHighlight;

  function getTtsRoot(): HTMLElement | null {
    return (
      storyBodyRef.current?.querySelector<HTMLElement>("[data-tts-root]") ??
      null
    );
  }

  function clearTtsHighlight() {
    clearActiveTtsWord(getTtsRoot());
  }

  function stopTtsHighlightLoop() {
    if (ttsRafRef.current !== null) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = null;
    }
  }

  function syncTtsHighlightFromClock() {
    const now = performance.now();
    if (now - ttsLastHighlightAtRef.current < 40) return;
    ttsLastHighlightAtRef.current = now;
    const mediaSec = readTtsMediaClock(ttsMediaClockRef.current);
    const index = findActiveWordIndex(ttsChunkWordsRef.current, mediaSec);
    setActiveTtsWord(getTtsRoot(), index);
  }

  function startTtsHighlightLoop() {
    stopTtsHighlightLoop();
    if (ttsChunkWordsRef.current.length === 0) return;

    const tick = () => {
      syncTtsHighlightFromClock();
      ttsRafRef.current = requestAnimationFrame(tick);
    };
    ttsRafRef.current = requestAnimationFrame(tick);
  }

  /**
   * Applies tempo to the audio element and re-anchors the media clock so
   * Whisper word timings stay aligned (wall-clock × rate).
   */
  function applyTtsPlaybackRate(rate = ttsSpeedRef.current) {
    const audio = audioRef.current;
    const clock = ttsMediaClockRef.current;
    const mediaSec = readTtsMediaClock(clock);
    if (audio) {
      audio.playbackRate = rate;
    }
    reanchorTtsMediaClock(
      clock,
      mediaSec,
      rate,
      Boolean(audio && !audio.paused),
    );
  }

  function stopTtsPlayback() {
    stopTtsHighlightLoop();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplay = null;
      audio.onpause = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioRef.current = null;
    ttsQueueRef.current = [];
    ttsChunkWordsRef.current = [];
    reanchorTtsMediaClock(
      ttsMediaClockRef.current,
      0,
      ttsSpeedRef.current,
      false,
    );
    for (const url of ttsObjectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    ttsObjectUrlsRef.current = [];
    clearTtsHighlight();
    setIsTtsPlaying(false);
  }

  function playNextTtsChunk() {
    const next = ttsQueueRef.current.shift();
    if (!next) {
      stopTtsPlayback();
      return;
    }

    ttsChunkWordsRef.current = next.words;
    clearTtsHighlight();
    stopTtsHighlightLoop();

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.onended = () => {
      stopTtsHighlightLoop();
      reanchorTtsMediaClock(
        ttsMediaClockRef.current,
        readTtsMediaClock(ttsMediaClockRef.current),
        ttsSpeedRef.current,
        false,
      );
      clearTtsHighlight();
      playNextTtsChunk();
    };
    audio.onerror = () => {
      stopTtsPlayback();
      toast.error("Abspielen hat nicht geklappt.");
    };
    audio.onplay = () => {
      const clock = ttsMediaClockRef.current;
      const startingFresh = audio.currentTime < 0.05;
      reanchorTtsMediaClock(
        clock,
        startingFresh ? 0 : readTtsMediaClock(clock),
        ttsSpeedRef.current,
        true,
      );
      startTtsHighlightLoop();
    };
    audio.onpause = () => {
      reanchorTtsMediaClock(
        ttsMediaClockRef.current,
        readTtsMediaClock(ttsMediaClockRef.current),
        ttsSpeedRef.current,
        false,
      );
      stopTtsHighlightLoop();
    };
    audio.src = next.url;
    audio.playbackRate = ttsSpeedRef.current;
    reanchorTtsMediaClock(
      ttsMediaClockRef.current,
      0,
      ttsSpeedRef.current,
      false,
    );
    void audio.play().then(
      () => setIsTtsPlaying(true),
      () => {
        stopTtsPlayback();
        toast.error("Abspielen wurde blockiert. Bitte erneut versuchen.");
      },
    );
  }

  async function handleToggleTts() {
    if (isTtsLoading) return;
    if (!readableAloud) return;

    if (isTtsPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      clearTtsHighlight();
      setIsTtsPlaying(false);
      return;
    }

    if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
      audioRef.current.playbackRate = ttsSpeedRef.current;
      void audioRef.current.play().then(
        () => setIsTtsPlaying(true),
        () => toast.error("Abspielen wurde blockiert."),
      );
      return;
    }

    if (!output) return;

    const storyText = plainTextFromStoryHtml(output);
    if (!storyText) {
      toast.error("In der Geschichte steht kein Text zum Vorlesen.");
      return;
    }

    setIsTtsLoading(true);
    stopTtsPlayback();

    try {
      // Only the spoken story body — never page chrome, facts, or image data URLs.
      // Tempo is applied client-side via playbackRate so the slider never re-fetches audio.
      const result = await synthesizeStorySpeechAction({
        storyText,
        wordHighlight: wordHighlightRef.current,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success || !result.data?.chunks.length) {
        toast.error(result.error ?? "Vorlesen hat nicht geklappt.");
        return;
      }

      const queue = result.data.chunks.map((chunk) => {
        const binary = atob(chunk.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: chunk.mimeType });
        return {
          url: URL.createObjectURL(blob),
          words: wordHighlightRef.current ? (chunk.words ?? []) : [],
        };
      });

      ttsObjectUrlsRef.current = queue.map((item) => item.url);
      ttsQueueRef.current = queue;

      if (wordHighlightRef.current) {
        const root = getTtsRoot();
        if (root) {
          wrapStoryWordsForTts(root);
        }
        const anyWords = queue.some((item) => item.words.length > 0);
        if (!anyWords) {
          toast.message("Vorlesen startet ohne Wort-Markierung.");
        }
      }

      playNextTtsChunk();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Vorlesen hat nicht geklappt.",
      );
      stopTtsPlayback();
    } finally {
      setIsTtsLoading(false);
    }
  }

  useEffect(() => {
    if (!isPending && !isTtsLoading) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isPending, isTtsLoading]);

  useEffect(() => {
    if (!readableAloud) {
      stopTtsPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop when Vorlesbar off
  }, [readableAloud]);

  useEffect(() => {
    return () => {
      stopTtsPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

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

    setStatusText(
      personalMode
        ? "Ich hole spannendes Wissen aus deiner Welt …"
        : "Ich hole spannendes Wissen für dich …",
    );

    trackUserActivity({
      action: "story.generate_click",
      label: "Klick: Geschichte erzeugen",
      metadata: {
        personalMode,
        topic: personalMode ? null : topic,
        profileId: activeProfileId,
        lengthStep,
        mood,
        schoolStage,
      },
    });

    startTransition(async () => {
      stopTtsPlayback();
      const result = await generateFreeStoryAction({
        personalMode: trialMode ? false : personalMode,
        profileId:
          trialMode || !personalMode
            ? undefined
            : (activeProfileId ?? undefined),
        syllableHelp,
        includeImages,
        trialMode,
        topic: trialMode || !personalMode ? topic : undefined,
        schoolStage,
        lengthStep,
        mood,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success || !result.data) {
        setStatusText(null);
        setFieldError(result.error ?? "Deine Geschichte konnte nicht entstehen.");
        toast.error(result.error ?? "Deine Geschichte konnte nicht entstehen.");
        setSelectionExpanded(true);
        return;
      }

      setStatusText(null);
      setOutput(result.data.story);
      setLearnedFacts(
        result.data.facts
          .map((fact) => (typeof fact === "string" ? fact.trim() : ""))
          .filter(Boolean),
      );
      setStorySchoolStage(schoolStage);
      setSelectionExpanded(false);
    });
  }

  async function handleExportPdf() {
    if (!output || isExporting) return;
    setIsExporting(true);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    setPdfPreviewHtml(null);
    try {
      const exportInput = {
        storyHtml: output,
        learnedFacts,
        bodyFontSizeRem: exportFontSizeForSchoolStage(
          storySchoolStage ?? schoolStage,
        ),
        schoolStage: storySchoolStage ?? schoolStage,
      };
      const html = buildStoryExportDocument(exportInput);
      const blob = await buildStoryPdfBlob(exportInput);
      const url = URL.createObjectURL(blob);
      setPdfPreviewHtml(html);
      setPdfPreviewUrl(url);
      setPdfPreviewOpen(true);
    } catch (error) {
      setPdfPreviewOpen(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "PDF konnte nicht erzeugt werden.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  const storyTextClass = storyBodyClassName(storySchoolStage ?? schoolStage);
  const hasStory = Boolean(output) && !isPending;
  const selectionCollapsed = hasStory && !selectionExpanded;
  const summaryTopic = personalMode
    ? `Persönlich (${selectedProfile?.displayName ?? "Profil"})`
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
    syllableHelp ? "Silbenhilfe" : null,
    wordHighlight ? "Wort-Markierung" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectionCardClass =
    "rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8";

  function handleProfileSelect(profileId: string | null) {
    if (profileId === null) {
      setSelectedProfileId(null);
      setLengthMoodOpen(false);
      if (!topic) setTopic(STORY_TOP_TOPICS[0]);
      trackUserActivity({
        action: "story.profile_select",
        label: "Leser: Freies lesen",
        metadata: { profileId: null },
      });
      return;
    }
    const next = childProfiles?.find((profile) => profile.id === profileId);
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

  return (
    <div className="grid items-start gap-8">
      {childProfiles !== null && !trialMode && !selectionCollapsed ? (
        <ChildProfilePickerCard
          profiles={childProfiles}
          selectedId={selectedProfileId}
          onSelect={handleProfileSelect}
          disabled={isPending}
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
                  Thema
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Wähl eines der Top-Themen für freies Lesen.
                </p>
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Thema"
                >
                  {STORY_TOP_TOPICS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setTopic(item);
                        trackUserActivity({
                          action: "story.topic_select",
                          label: "Thema gewählt",
                          metadata: { topic: item },
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
                </div>
              </section>
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
                        onClick={() => setSchoolStage(stage.id)}
                        label={stage.label}
                      />
                    );
                  })}
                </div>
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
              </>
            ) : null}

            {fieldError ? (
              <p className="text-sm font-semibold text-orange-800">
                {fieldError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
                isPending && "opacity-70",
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
        <div className="grid gap-6">
          <section
            aria-label="Deine Geschichte"
            className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Deine Geschichte
              </p>
              <div className="flex flex-col items-end gap-3 self-end sm:self-auto">
                <div className="flex items-center gap-2">
                  {readableAloud ? (
                    <>
                      <label
                        htmlFor="story-tts-speed"
                        className="flex min-w-[9.5rem] flex-col gap-1"
                      >
                        <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
                          Tempo{" "}
                          <span className="tabular-nums text-orange-700">
                            {ttsSpeed.toFixed(1).replace(".", ",")}×
                          </span>
                        </span>
                        <input
                          id="story-tts-speed"
                          type="range"
                          min={0.8}
                          max={1.1}
                          step={0.1}
                          value={ttsSpeed}
                          disabled={isTtsLoading}
                          aria-valuetext={`${ttsSpeed.toFixed(1).replace(".", ",")} mal`}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            setTtsSpeed(next);
                            ttsSpeedRef.current = next;
                            applyTtsPlaybackRate(next);
                          }}
                          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-100 ring-1 ring-zinc-950/10 disabled:cursor-not-allowed disabled:opacity-70 [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:shadow-sm [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:shadow-sm"
                        />
                        <span className="flex justify-between text-[0.65rem] font-semibold text-zinc-500">
                          <span>Langsamer</span>
                          <span>Schneller</span>
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleTts();
                        }}
                        disabled={isTtsLoading || !output}
                        aria-label={
                          isTtsLoading
                            ? "Vorlesen wird vorbereitet"
                            : isTtsPlaying
                              ? "Vorlesen pausieren"
                              : "Geschichte vorlesen"
                        }
                        title={
                          isTtsLoading
                            ? "Vorlesen wird vorbereitet …"
                            : isTtsPlaying
                              ? "Pausieren"
                              : "Vorlesen"
                        }
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-700 text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
                      >
                        {isTtsLoading ? (
                          <Loader2 className="size-5 animate-spin" aria-hidden />
                        ) : isTtsPlaying ? (
                          <Pause className="size-5" aria-hidden />
                        ) : (
                          <Play className="size-5 translate-x-px" aria-hidden />
                        )}
                      </button>
                    </>
                  ) : null}
                  {allowPdfExport ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleExportPdf();
                      }}
                      disabled={isExporting}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
                    >
                      {isExporting ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <FileDown className="size-4" aria-hidden />
                      )}
                      {isExporting ? "PDF wird vorbereitet …" : "Als PDF"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div ref={storyBodyRef}>
              <StoryHtmlBody
                key={output}
                content={output}
                className={storyTextClass}
              />
            </div>
          </section>

          {learnedFacts.length > 0 ? (
            <StoryFactsList
              facts={learnedFacts}
              schoolStage={storySchoolStage ?? schoolStage}
              allowFactWhy={allowFactWhy}
              allowFactWhyMore={allowFactWhyMore}
            />
          ) : null}
        </div>
      ) : null}

      {isPending ? (
        <StoryWaitOverlay
          statusText={statusText}
          includeImages={includeImages}
        />
      ) : null}
      {isTtsLoading ? (
        <TtsWaitOverlay wordHighlight={wordHighlight} />
      ) : null}
      <StoryPdfPreviewDialog
        open={pdfPreviewOpen}
        previewHtml={pdfPreviewHtml}
        pdfUrl={pdfPreviewUrl}
        onClose={() => {
          setPdfPreviewOpen(false);
          if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
          }
          setPdfPreviewUrl(null);
          setPdfPreviewHtml(null);
        }}
      />
    </div>
  );
}

/**
 * Full-screen wait dialog. Only mounts while pending (client-only interaction),
 * so `document.body` exists without a portalReady effect.
 */
function StoryWaitOverlay({
  statusText,
  includeImages,
}: {
  statusText: string | null;
  includeImages: boolean;
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
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          {includeImages
            ? "Zuerst hole ich Neues zum Staunen. Danach entstehen Geschichte und Bilder parallel — zum Schluss fließt der Text um die Bilder. Das kann einen Moment dauern."
            : "Zuerst hole ich Neues zum Staunen. Danach schreibe ich die Geschichte."}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Wait dialog while TTS (and optional Whisper word timings) are prepared.
 */
function TtsWaitOverlay({ wordHighlight }: { wordHighlight: boolean }) {
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="tts-wait-title"
      aria-describedby="tts-wait-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center shadow-2xl ring-1 ring-zinc-950/10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 ring-1 ring-orange-700/15">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </span>
        <h2
          id="tts-wait-title"
          className="mt-5 text-xl font-extrabold text-zinc-950"
        >
          Vorlesen wird vorbereitet
        </h2>
        <p
          id="tts-wait-desc"
          className="mt-2 text-sm font-semibold text-orange-900"
        >
          {wordHighlight
            ? "Stimme und Wort-Markierung werden erzeugt …"
            : "Die Geschichte wird eingesprochen …"}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          {wordHighlight
            ? "Wort-Markierung braucht etwas länger: Zuerst die Stimme, danach die Zeiten für jedes Wort. Bitte kurz warten — gleich geht’s los."
            : "Einen kleinen Moment bitte — gleich wird vorgelesen."}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function storyBodyClassName(stage: StorySchoolStageId): string {
  // Vorschule / 1. Klasse: larger type, looser line + letter spacing for early readers.
  if (stage === "vorschule") {
    return "text-2xl leading-[1.9] tracking-wide sm:text-3xl [&_h1]:leading-snug [&_h1]:tracking-wide";
  }
  if (stage === "klasse_1") {
    return "text-xl leading-[1.85] tracking-wide sm:text-2xl [&_h1]:leading-snug [&_h1]:tracking-wide";
  }
  if (stage === "klasse_2") {
    return "text-xl sm:text-2xl";
  }
  return "text-lg sm:text-xl";
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
