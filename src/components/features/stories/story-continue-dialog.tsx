"use client";

/**
 * Dialog: pick stage/length/mood, then generate a linked continuation.
 * Close via X only (no Abbrechen). Primary: Fortsetzung starten.
 */

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { continueStoryAction } from "@/app/actions/story-continue";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import { cn } from "@/lib/utils";

export type StoryContinueSuccess = {
  storyHtml: string;
  facts: string[];
  schoolStage: StorySchoolStageId;
  libraryStoryId: string;
  creditsRemaining?: number;
};

export function StoryContinueDialog({
  open,
  onClose,
  parentStoryId,
  lengthCatalog,
  initialSchoolStage,
  initialLengthStep,
  initialMood,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  parentStoryId: string;
  lengthCatalog: StoryLengthCatalog;
  initialSchoolStage: StorySchoolStageId;
  initialLengthStep: StoryLengthStepId;
  initialMood: StoryMoodId;
  onSuccess: (result: StoryContinueSuccess) => void;
}) {
  const titleId = useId();
  const botGuard = useBotGuardFields();
  const [mounted, setMounted] = useState(false);
  const [schoolStage, setSchoolStage] =
    useState<StorySchoolStageId>(initialSchoolStage);
  const [lengthStep, setLengthStep] =
    useState<StoryLengthStepId>(initialLengthStep);
  const [mood, setMood] = useState<StoryMoodId>(initialMood);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSchoolStage(initialSchoolStage);
    setLengthStep(initialLengthStep);
    setMood(initialMood);
  }, [open, initialSchoolStage, initialLengthStep, initialMood]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isPending, onClose]);

  if (!open || !mounted) return null;

  function handleSubmit() {
    startTransition(async () => {
      const result = await continueStoryAction({
        parentStoryId,
        schoolStage,
        lengthStep,
        mood,
        ...botGuard.getBotGuardPayload(),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Fortsetzung fehlgeschlagen.");
        return;
      }
      onSuccess({
        storyHtml: result.data.story,
        facts: result.data.facts,
        schoolStage,
        libraryStoryId: result.data.libraryStoryId,
        creditsRemaining: result.data.creditsRemaining,
      });
      toast.success("Fortsetzung ist da!");
      onClose();
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Fortsetzung
            </p>
            <h2
              id={titleId}
              className="mt-1 text-xl font-extrabold tracking-tight text-zinc-950"
            >
              Wie könnte es weitergehen?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Wähl Ton und Länge — leseno schreibt eine Fortsetzung zur aktuellen
              Geschichte und speichert sie in der Bücherei.
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-zinc-700 hover:bg-gray-200 disabled:opacity-70"
            aria-label="Schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <BotGuardFields
          website={botGuard.website}
          onWebsiteChange={botGuard.setWebsite}
          formStartedAt={botGuard.formStartedAt}
        />

        <div className="mt-6 space-y-5">
          <div>
            <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Lesestufe
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STORY_SCHOOL_STAGES.map((stage) => {
                const active = schoolStage === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => setSchoolStage(stage.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                      active
                        ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                        : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                    )}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Art der Geschichte
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STORY_MOODS.map((entry) => {
                const active = mood === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => setMood(entry.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                      active
                        ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                        : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                    )}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>

          <StoryLengthSlider
            catalog={lengthCatalog}
            value={lengthStep}
            onChange={setLengthStep}
          />
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className={cn(
            "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
            isPending && "opacity-70",
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Fortsetzung entsteht …
            </>
          ) : (
            "Fortsetzung starten"
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
