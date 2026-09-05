"use client";

/**
 * Shared story result card (HTML + TTS + PDF + facts).
 * Used on `/geschichte` after generation and in Meine Bücherei when expanded.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import {
  synthesizeStorySpeechAction,
  type StoryTtsWordTiming,
} from "@/app/actions/story-tts";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";
import { StoryHtmlBody } from "@/components/features/stories/story-html-body";
import { StoryPdfPreviewDialog } from "@/components/features/stories/story-pdf-preview-dialog";
import { InviteFriendsCard } from "@/components/features/marketing/invite-friends-card";
import {
  exportFontSizeForSchoolStage,
  buildStoryExportDocument,
  buildStoryPdfBlob,
} from "@/lib/stories/export-story-document";
import { plainTextFromStoryHtml } from "@/lib/stories/plain-text-from-html";
import type { StorySchoolStageId } from "@/lib/stories/options";
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

export function StoryResultPanel({
  storyHtml,
  facts,
  schoolStage,
  readableAloud = false,
  wordHighlight = false,
  allowPdfExport = false,
  allowFactWhy = false,
  allowFactWhyMore = false,
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
  eyebrow?: string;
  /** When set, invite link includes a personal `?ref=` code. */
  inviteUserId?: string | null;
  /** When set, shows a close control (library expand). */
  onClose?: () => void;
}) {
  const botGuard = useBotGuardFields();
  const [isExporting, setIsExporting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1);

  const storyBodyRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<{ url: string; words: StoryTtsWordTiming[] }[]>(
    [],
  );
  const ttsObjectUrlsRef = useRef<string[]>([]);
  const ttsChunkWordsRef = useRef<StoryTtsWordTiming[]>([]);
  const ttsLastHighlightAtRef = useRef(0);
  const ttsMediaClockRef = useRef<TtsMediaClock>(createTtsMediaClock(1));
  const ttsRafRef = useRef<number | null>(null);
  const ttsSpeedRef = useRef(ttsSpeed);
  ttsSpeedRef.current = ttsSpeed;
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
    if (!readableAloud) {
      stopTtsPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop when Vorlesbar off
  }, [readableAloud]);

  useEffect(() => {
    stopTtsPlayback();
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

  const storyTextClass = storyBodyClassName(schoolStage);

  return (
    <div className="relative grid gap-6">
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />
      <section
        aria-label={eyebrow}
        className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            {eyebrow}
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
                    disabled={isTtsLoading || !storyHtml}
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
        <div ref={storyBodyRef}>
          <StoryHtmlBody
            key={storyHtml}
            content={storyHtml}
            className={storyTextClass}
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
