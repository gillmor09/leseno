"use client";

/**
 * Fullscreen reading mode: story + Warum-facts, typography overlay (X only).
 * Custom prefs persist on the child profile / localStorage; Standard = admin stage defaults.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { saveChildReadingModePrefsAction } from "@/app/actions/user-world";
import { ReadingModePrefsControls } from "@/components/features/stories/reading-mode-prefs-controls";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";
import { StoryHtmlBody } from "@/components/features/stories/story-html-body";
import {
  clearReadingModePrefs,
  loadStoredReadingModePrefs,
  normalizeReadingModePrefs,
  saveReadingModePrefs,
  type ReadingModePrefs,
} from "@/lib/stories/reading-mode-prefs";
import type { StorySchoolStageId } from "@/lib/stories/options";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import { cn } from "@/lib/utils";

/** Reading-mode story body: inherit parent size/line-height/weight; keep heading weight. */
const READING_STORY_CLASS =
  "[&_h1]:mb-[0.75em] [&_h1]:text-[1.35em] [&_h1]:font-extrabold " +
  "[&_h2]:font-extrabold [&_p]:mb-[0.85em]";

function stageLabel(stage: StorySchoolStageId): string {
  return (
    STORY_SCHOOL_STAGES.find((entry) => entry.id === stage)?.label ?? stage
  );
}

function resolveEffectivePrefs(input: {
  profileId: string | null | undefined;
  customPrefs: ReadingModePrefs | null | undefined;
  stageDefaults: ReadingModePrefs;
}): { prefs: ReadingModePrefs; isCustom: boolean } {
  const stage = normalizeReadingModePrefs(input.stageDefaults);
  if (input.customPrefs) {
    return {
      prefs: normalizeReadingModePrefs(input.customPrefs, stage),
      isCustom: true,
    };
  }
  const stored = loadStoredReadingModePrefs(input.profileId);
  if (stored) {
    return {
      prefs: normalizeReadingModePrefs(stored, stage),
      isCustom: true,
    };
  }
  return { prefs: stage, isCustom: false };
}

export function StoryReadingMode({
  open,
  onClose,
  storyHtml,
  facts,
  schoolStage,
  allowFactWhy = false,
  allowFactWhyMore = false,
  profileId = null,
  customPrefs = null,
  stageDefaults,
  onPrefsChange,
}: {
  open: boolean;
  onClose: () => void;
  storyHtml: string;
  facts: string[];
  schoolStage: StorySchoolStageId;
  allowFactWhy?: boolean;
  allowFactWhyMore?: boolean;
  /** When set, prefs save to this child profile (and local mirror). */
  profileId?: string | null;
  /** Profile override; null = follow stage Standard (unless localStorage has custom). */
  customPrefs?: ReadingModePrefs | null;
  /** Admin defaults for this story's school stage. */
  stageDefaults: ReadingModePrefs;
  /** Parent cache: prefs or null when reset to Standard. */
  onPrefsChange?: (prefs: ReadingModePrefs | null) => void;
}) {
  const titleId = useId();
  const [prefs, setPrefs] = useState(() =>
    normalizeReadingModePrefs(stageDefaults),
  );
  const [isCustom, setIsCustom] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const saveSeqRef = useRef(0);
  const customPrefsRef = useRef(customPrefs);
  customPrefsRef.current = customPrefs;
  const stageDefaultsRef = useRef(stageDefaults);
  stageDefaultsRef.current = stageDefaults;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false);
      return;
    }
    const resolved = resolveEffectivePrefs({
      profileId,
      customPrefs: customPrefsRef.current,
      stageDefaults: stageDefaultsRef.current,
    });
    setPrefs(resolved.prefs);
    setIsCustom(resolved.isCustom);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const root = document.documentElement;
    const canFullscreen =
      typeof root.requestFullscreen === "function" &&
      !document.fullscreenElement;
    if (canFullscreen) {
      void root.requestFullscreen().catch(() => {
        // Overlay still works without browser fullscreen.
      });
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, [open, profileId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, settingsOpen, onClose]);

  function persistCustomPrefs(next: ReadingModePrefs) {
    const normalized = normalizeReadingModePrefs(
      next,
      stageDefaultsRef.current,
    );
    setPrefs(normalized);
    setIsCustom(true);
    saveReadingModePrefs(normalized, profileId);
    onPrefsChange?.(normalized);

    if (profileId) {
      const seq = ++saveSeqRef.current;
      void saveChildReadingModePrefsAction({
        profileId,
        prefs: normalized,
      }).then((result) => {
        if (seq !== saveSeqRef.current) return;
        if (!result.success) {
          toast.error(
            result.error ?? "Darstellung konnte nicht gespeichert werden.",
          );
        }
      });
    }
  }

  function resetToStandard() {
    const stage = normalizeReadingModePrefs(stageDefaultsRef.current);
    setPrefs(stage);
    setIsCustom(false);
    clearReadingModePrefs(profileId);
    onPrefsChange?.(null);

    if (profileId) {
      const seq = ++saveSeqRef.current;
      void saveChildReadingModePrefsAction({
        profileId,
        prefs: null,
      }).then((result) => {
        if (seq !== saveSeqRef.current) return;
        if (!result.success) {
          toast.error(
            result.error ?? "Standard konnte nicht gespeichert werden.",
          );
        }
      });
    }
  }

  if (!open || !mounted) return null;

  const typographyStyle = {
    fontSize: `${prefs.fontScale}rem`,
    lineHeight: prefs.lineHeight,
    letterSpacing: `${prefs.letterSpacingEm}em`,
    fontWeight: prefs.fontWeight,
  } satisfies CSSProperties;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] flex flex-col bg-gray-100"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/10 bg-white px-4 py-3 sm:px-6">
        <h2
          id={titleId}
          className="text-sm font-extrabold tracking-wide text-orange-700 uppercase"
        >
          Lesemodus
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-full transition-all duration-200 ease-in-out",
              settingsOpen
                ? "bg-orange-700 text-white"
                : "bg-gray-100 text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200",
            )}
            aria-label="Darstellung anpassen"
            aria-expanded={settingsOpen}
            title="Darstellung"
          >
            <Settings2 className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900"
            aria-label="Lesemodus schließen"
            title="Schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div
          className="absolute top-[4.25rem] right-4 z-20 max-h-[min(70vh,32rem)] w-[min(100%-2rem,20rem)] overflow-y-auto rounded-[1.5rem] bg-white p-5 shadow-2xl ring-1 ring-zinc-950/10 sm:right-6"
          role="region"
          aria-label="Darstellung"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-zinc-950">Darstellung</p>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-full bg-gray-100 text-zinc-700 hover:bg-gray-200"
              aria-label="Darstellung schließen"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <ReadingModePrefsControls
            prefs={prefs}
            onChange={persistCustomPrefs}
          />

          <button
            type="button"
            disabled={!isCustom}
            onClick={resetToStandard}
            className={cn(
              "mt-5 w-full rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-200 ease-in-out",
              isCustom
                ? "bg-gray-100 text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200"
                : "cursor-default bg-gray-50 text-zinc-400",
            )}
          >
            {isCustom ? "Auf Standard zurücksetzen" : "Aktuell: Standard"}
          </button>
          <p className="mt-2 text-[0.65rem] leading-snug text-zinc-500">
            Standard richtet sich nach der Schulstufe ({stageLabel(schoolStage)}
            ).
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto grid gap-8 px-4 py-8 sm:px-6 sm:py-10"
          style={{ maxWidth: `${prefs.contentMaxWidthRem}rem` }}
        >
          <article
            className="rounded-[1.75rem] bg-white p-6 text-zinc-800 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
            style={typographyStyle}
          >
            <StoryHtmlBody
              key={storyHtml}
              content={storyHtml}
              inheritTypography
              className={READING_STORY_CLASS}
            />
          </article>

          {facts.length > 0 ? (
            <div
              className={cn(
                "[&_*]:!leading-[inherit] [&_*]:!tracking-[inherit]",
              )}
              style={{
                ...typographyStyle,
                fontSize: `${Math.max(0.95, prefs.fontScale * 0.92)}rem`,
              }}
            >
              <StoryFactsList
                facts={facts}
                schoolStage={schoolStage}
                allowFactWhy={allowFactWhy}
                allowFactWhyMore={allowFactWhyMore}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
