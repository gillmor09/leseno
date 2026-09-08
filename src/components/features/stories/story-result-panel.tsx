"use client";

/**
 * Shared story result card (HTML + TTS + PDF + facts).
 * Used on `/geschichte` after generation and in Meine Bücherei when expanded.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { FileDown, GitBranchPlus, Headphones, Loader2, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import {
  synthesizeStorySpeechAction,
  type StoryTtsWordTiming,
} from "@/app/actions/story-tts";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { StoryContinueDialog } from "@/components/features/stories/story-continue-dialog";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";
import { StoryHtmlBody } from "@/components/features/stories/story-html-body";
import { InviteFriendsCard } from "@/components/features/marketing/invite-friends-card";
import {
  exportFontSizeForSchoolStage,
  buildStoryExportDocument,
  buildStoryPdfBlob,
} from "@/lib/stories/export-story-document";
import { plainTextFromStoryHtml } from "@/lib/stories/plain-text-from-html";
import type { ReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import { normalizeReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";
import {
  typographyDefaultsForStage,
  type ReadingTypographyDefaultsCatalog,
} from "@/lib/stories/reading-typography-defaults";
import { titleFromStoryHtml } from "@/lib/stories/title-from-html";
import { storyTtsPlayPath } from "@/lib/stories/tts-download-name";
import {
  clearActiveTtsWord,
  findActiveWordIndex,
  setActiveTtsWord,
  wrapStoryWordsForTts,
} from "@/lib/stories/tts-dom-highlight";

const StoryPdfPreviewDialog = dynamic(
  () =>
    import("@/components/features/stories/story-pdf-preview-dialog").then(
      (mod) => mod.StoryPdfPreviewDialog,
    ),
  { ssr: false },
);

const StoryReadingMode = dynamic(
  () =>
    import("@/components/features/stories/story-reading-mode").then(
      (mod) => mod.StoryReadingMode,
    ),
  { ssr: false },
);

const CARD_STORY_CLASS =
  "[&_h1]:mb-[0.75em] [&_h1]:text-[1.35em] [&_h1]:font-extrabold " +
  "[&_h2]:font-extrabold [&_p]:mb-[0.85em]";

export function StoryResultPanel({
  storyHtml,
  facts,
  schoolStage,
  readableAloud = false,
  wordHighlight = false,
  allowPdfExport = false,
  allowFactWhy = false,
  allowFactWhyMore = false,
  allowReadingMode = false,
  readingProfileId = null,
  readingModePrefs = null,
  onReadingModePrefsChange,
  typographyDefaults,
  allowContinue = false,
  libraryStoryId = null,
  hasStoredTts = false,
  lengthCatalog = null,
  continueLengthStep = "mittel",
  continueMood = "spannend",
  onContinued,
  onTtsPersisted,
  eyebrow = "Deine Geschichte",
  inviteUserId = null,
  onClose,
}: {
  storyHtml: string;
  facts: string[];
  schoolStage: StorySchoolStageId;
  readableAloud?: boolean;
  wordHighlight?: boolean;
  allowPdfExport?: boolean;
  allowFactWhy?: boolean;
  allowFactWhyMore?: boolean;
  /** Package `lesemodus`: fullscreen reading with typography controls. */
  allowReadingMode?: boolean;
  /** Child profile that owns Lesemodus prefs (null = local only). */
  readingProfileId?: string | null;
  /** Profile Lesemodus override; null = stage Standard. */
  readingModePrefs?: ReadingModePrefs | null;
  onReadingModePrefsChange?: (prefs: ReadingModePrefs | null) => void;
  /** Admin typography defaults per school stage (card + Lesemodus Standard). */
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  /** Package `fortsetzen`: show continue control when library id is known. */
  allowContinue?: boolean;
  libraryStoryId?: string | null;
  /** Library already has TTS in Storage — show player without generating first. */
  hasStoredTts?: boolean;
  lengthCatalog?: StoryLengthCatalog | null;
  continueLengthStep?: StoryLengthStepId;
  continueMood?: StoryMoodId;
  onContinued?: (result: {
    storyHtml: string;
    facts: string[];
    schoolStage: StorySchoolStageId;
    libraryStoryId: string;
    creditsRemaining?: number;
  }) => void;
  /** Fired when Vorlesen was saved to Storage (for library card audio). */
  onTtsPersisted?: () => void;
  eyebrow?: string;
  /** When set, invite link includes a personal `?ref=` code. */
  inviteUserId?: string | null;
  /** When set, shows a close control (library expand). */
  onClose?: () => void;
}) {
  const botGuard = useBotGuardFields();
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [storedTtsReady, setStoredTtsReady] = useState(hasStoredTts);
  /** Seekable merged MP3 (app proxy URL or blob). */
  const [ttsAudioSrc, setTtsAudioSrc] = useState<string | null>(() => {
    if (hasStoredTts && libraryStoryId && readableAloud) {
      return storyTtsPlayPath(libraryStoryId, titleFromStoryHtml(storyHtml));
    }
    return null;
  });

  const storyBodyRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsWordsRef = useRef<StoryTtsWordTiming[]>([]);
  const ttsLastHighlightAtRef = useRef(0);
  const ttsRafRef = useRef<number | null>(null);
  const wordHighlightRef = useRef(wordHighlight);
  wordHighlightRef.current = wordHighlight;
  const libraryStoryIdRef = useRef(libraryStoryId);
  libraryStoryIdRef.current = libraryStoryId;

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

  function syncTtsHighlightFromAudio() {
    const now = performance.now();
    if (now - ttsLastHighlightAtRef.current < 40) return;
    ttsLastHighlightAtRef.current = now;
    const audio = audioRef.current;
    if (!audio) return;
    const index = findActiveWordIndex(ttsWordsRef.current, audio.currentTime);
    setActiveTtsWord(getTtsRoot(), index);
  }

  function startTtsHighlightLoop() {
    stopTtsHighlightLoop();
    if (ttsWordsRef.current.length === 0) return;

    const tick = () => {
      syncTtsHighlightFromAudio();
      ttsRafRef.current = requestAnimationFrame(tick);
    };
    ttsRafRef.current = requestAnimationFrame(tick);
  }

  function revokeTtsObjectUrl() {
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  }

  function resolveStoredTtsUrl(): string | null {
    if (!storedTtsReady || !libraryStoryId || !readableAloud) return null;
    return storyTtsPlayPath(libraryStoryId, titleFromStoryHtml(storyHtml));
  }

  function resetTtsToStoredOrClear() {
    stopTtsHighlightLoop();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    ttsWordsRef.current = [];
    revokeTtsObjectUrl();
    clearTtsHighlight();
    setIsTtsPlaying(false);
    setTtsAudioSrc(resolveStoredTtsUrl());
  }

  function stopTtsPlayback() {
    stopTtsHighlightLoop();
    setTtsAudioSrc(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    ttsWordsRef.current = [];
    revokeTtsObjectUrl();
    clearTtsHighlight();
    setIsTtsPlaying(false);
  }

  async function handlePrepareTts() {
    if (isTtsLoading) return;
    if (!readableAloud) return;
    if (ttsAudioSrc) return;
    if (!storyHtml) return;

    const storyText = plainTextFromStoryHtml(storyHtml);
    if (!storyText) {
      toast.error("In der Geschichte steht kein Text zum Vorlesen.");
      return;
    }

    setIsTtsLoading(true);
    stopTtsPlayback();

    try {
      const result = await synthesizeStorySpeechAction({
        storyText,
        wordHighlight: wordHighlightRef.current,
        libraryStoryId: libraryStoryIdRef.current,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success || !result.data) {
        toast.error(result.error ?? "Vorlesen hat nicht geklappt.");
        return;
      }

      let src = result.data.audioUrl?.trim() || "";
      if (!src && result.data.audioBase64) {
        const binary = atob(result.data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const fileName =
          result.data.downloadFileName?.trim() || "Geschichte.mp3";
        const file = new File([bytes], fileName, {
          type: result.data.mimeType,
        });
        src = URL.createObjectURL(file);
        ttsObjectUrlRef.current = src;
      }

      if (!src) {
        toast.error("Vorlesen hat kein Audio geliefert.");
        return;
      }

      const words = wordHighlightRef.current ? (result.data.words ?? []) : [];
      ttsWordsRef.current = words;
      setTtsAudioSrc(src);

      if (result.data.persisted) {
        setStoredTtsReady(true);
        onTtsPersisted?.();
      }

      if (wordHighlightRef.current) {
        const root = getTtsRoot();
        if (root) {
          wrapStoryWordsForTts(root);
        }
        if (words.length === 0) {
          toast.message("Vorlesen ist bereit ohne Wort-Markierung.");
        }
      }
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

  async function handleExportPdf() {
    if (!storyHtml || isExporting) return;
    setIsExporting(true);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    setPdfPreviewHtml(null);
    try {
      const exportInput = {
        storyHtml,
        learnedFacts: facts,
        bodyFontSizeRem: exportFontSizeForSchoolStage(schoolStage),
        schoolStage,
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

  useEffect(() => {
    if (!isTtsLoading) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isTtsLoading]);

  useEffect(() => {
    setStoredTtsReady(hasStoredTts);
  }, [hasStoredTts]);

  useEffect(() => {
    if (!readableAloud) {
      stopTtsPlayback();
      return;
    }
    resetTtsToStoredOrClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when Vorlesbar / stored flag changes
  }, [readableAloud, hasStoredTts, libraryStoryId]);

  useEffect(() => {
    resetTtsToStoredOrClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset audio when story changes
  }, [storyHtml]);

  useEffect(() => {
    return () => {
      stopTtsPlayback();
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const stageDefaults = normalizeReadingModePrefs(
    typographyDefaultsForStage(typographyDefaults, schoolStage),
  );
  const cardStyle = {
    fontSize: `${stageDefaults.fontScale}rem`,
    lineHeight: stageDefaults.lineHeight,
    letterSpacing: `${stageDefaults.letterSpacingEm}em`,
    fontWeight: stageDefaults.fontWeight,
  };

  return (
    <div className="relative grid min-w-0 max-w-full gap-6">
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />
      <section
        aria-label={eyebrow}
        className="min-w-0 max-w-full overflow-x-hidden rounded-[1.75rem] bg-white p-6 text-zinc-800 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
        style={cardStyle}
      >
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            {eyebrow}
          </p>
          <div className="flex min-w-0 flex-col items-stretch gap-3 self-stretch sm:items-end sm:self-auto">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {allowContinue && libraryStoryId && lengthCatalog ? (
                <button
                  type="button"
                  onClick={() => setContinueOpen(true)}
                  disabled={!storyHtml}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-700 text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
                  aria-label="Wie könnte es weitergehen?"
                  title="Wie könnte es weitergehen?"
                >
                  <GitBranchPlus className="size-5" aria-hidden />
                </button>
              ) : null}
              {allowReadingMode ? (
                <button
                  type="button"
                  onClick={() => setReadingModeOpen(true)}
                  disabled={!storyHtml}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900 disabled:opacity-70"
                  aria-label="Lesemodus öffnen"
                  title="Lesemodus"
                >
                  <Maximize2 className="size-5" aria-hidden />
                </button>
              ) : null}
              {readableAloud && !ttsAudioSrc ? (
                <button
                  type="button"
                  onClick={() => {
                    void handlePrepareTts();
                  }}
                  disabled={isTtsLoading || !storyHtml}
                  aria-label={
                    isTtsLoading
                      ? "Vorlesen wird vorbereitet"
                      : "Vorlesen erzeugen"
                  }
                  title={
                    isTtsLoading
                      ? "Vorlesen wird vorbereitet …"
                      : "Vorlesen erzeugen"
                  }
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-700 text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
                >
                  {isTtsLoading ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <Headphones className="size-5" aria-hidden />
                  )}
                </button>
              ) : null}
              {allowPdfExport ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleExportPdf();
                  }}
                  disabled={isExporting || !storyHtml}
                  aria-label={
                    isExporting ? "PDF wird vorbereitet" : "Als PDF speichern"
                  }
                  title={
                    isExporting ? "PDF wird vorbereitet …" : "Als PDF"
                  }
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-700 text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
                >
                  {isExporting ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="size-5" aria-hidden />
                  )}
                </button>
              ) : null}
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900"
                  aria-label="Geschichte schließen"
                  title="Schließen"
                >
                  <X className="size-5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {readableAloud && ttsAudioSrc ? (
          <audio
            ref={(el) => {
              audioRef.current = el;
            }}
            src={ttsAudioSrc}
            controls
            preload="metadata"
            className="mt-2 w-full max-w-full"
            onPlay={() => {
              setIsTtsPlaying(true);
              startTtsHighlightLoop();
            }}
            onPause={() => {
              stopTtsHighlightLoop();
              setIsTtsPlaying(false);
            }}
            onEnded={() => {
              stopTtsHighlightLoop();
              clearTtsHighlight();
              setIsTtsPlaying(false);
            }}
            onSeeked={() => {
              syncTtsHighlightFromAudio();
            }}
            onError={() => {
              if (!ttsAudioSrc) return;
              toast.error("Abspielen hat nicht geklappt.");
            }}
          >
            Dein Browser kann Vorlesen nicht abspielen.
          </audio>
        ) : null}
        <div ref={storyBodyRef} className="min-w-0 max-w-full">
          <StoryHtmlBody
            key={storyHtml}
            content={storyHtml}
            inheritTypography
            className={CARD_STORY_CLASS}
          />
        </div>
      </section>

      {facts.length > 0 ? (
        <StoryFactsList
          facts={facts}
          schoolStage={schoolStage}
          allowFactWhy={allowFactWhy}
          allowFactWhyMore={allowFactWhyMore}
        />
      ) : null}

      {inviteUserId == null ? (
        <InviteFriendsCard variant="compact" />
      ) : null}

      {allowReadingMode && readingModeOpen ? (
        <StoryReadingMode
          open={readingModeOpen}
          onClose={() => setReadingModeOpen(false)}
          storyHtml={storyHtml}
          facts={facts}
          schoolStage={schoolStage}
          allowFactWhy={allowFactWhy}
          allowFactWhyMore={allowFactWhyMore}
          profileId={readingProfileId}
          customPrefs={readingModePrefs}
          stageDefaults={stageDefaults}
          onPrefsChange={onReadingModePrefsChange}
        />
      ) : null}

      {allowContinue && libraryStoryId && lengthCatalog ? (
        <StoryContinueDialog
          open={continueOpen}
          onClose={() => setContinueOpen(false)}
          parentStoryId={libraryStoryId}
          lengthCatalog={lengthCatalog}
          initialSchoolStage={schoolStage}
          initialLengthStep={continueLengthStep}
          initialMood={continueMood}
          onSuccess={(result) => {
            onContinued?.(result);
          }}
        />
      ) : null}

      {isTtsLoading ? (
        <TtsWaitOverlay wordHighlight={wordHighlight} />
      ) : null}
      {pdfPreviewOpen ? (
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
      ) : null}
    </div>
  );
}

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
