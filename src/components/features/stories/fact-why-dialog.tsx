"use client";

/**
 * Dialog: fact background („Warum?“) + optional deeper follow-up.
 * Scrollable body; close via X / Escape / outside. Footer: „Ich will mehr wissen“ only.
 */

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  explainFactWhyAction,
  explainFactWhyMoreAction,
} from "@/app/actions/fact-why";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import type { StorySchoolStageId } from "@/lib/stories/options";

type FactWhyDialogProps = {
  open: boolean;
  fact: string;
  schoolStage: StorySchoolStageId;
  onClose: () => void;
  /** Package `hintergrund`: show „Ich will mehr wissen“. */
  allowMore?: boolean;
};

function paragraphsFromText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Loads background on open; optional second query for „Ich will mehr wissen“.
 */
export function FactWhyDialog({
  open,
  fact,
  schoolStage,
  onClose,
  allowMore = true,
}: FactWhyDialogProps) {
  const botGuard = useBotGuardFields();
  const [background, setBackground] = useState<string | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [isLoadingWhy, startWhy] = useTransition();
  const [isLoadingMore, startMore] = useTransition();

  useEffect(() => {
    if (!open) {
      setBackground(null);
      setMore(null);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !fact.trim()) return;

    setBackground(null);
    setMore(null);

    startWhy(async () => {
      const result = await explainFactWhyAction({
        fact,
        schoolStage,
        ...botGuard.getBotGuardPayload(),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Erklärung fehlgeschlagen.");
        onClose();
        return;
      }
      setBackground(result.data.text);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open/fact
  }, [open, fact, schoolStage]);

  function handleMore() {
    if (!background || isLoadingMore || more) return;
    startMore(async () => {
      const result = await explainFactWhyMoreAction({
        fact,
        schoolStage,
        background,
        ...botGuard.getBotGuardPayload(),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Weitere Infos fehlgeschlagen.");
        return;
      }
      setMore(result.data.text);
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fact-why-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-950/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
              <Sparkles className="size-3.5" aria-hidden />
              Warum?
            </p>
            <h2
              id="fact-why-title"
              className="mt-2 text-lg font-extrabold leading-snug text-zinc-950 sm:text-xl"
            >
              Was steckt dahinter?
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold leading-relaxed text-orange-950">
            {fact}
          </p>

          <div className="mt-5">
            <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
              Hintergrund
            </p>
            {isLoadingWhy || !background ? (
              <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-zinc-600">
                <Loader2
                  className="size-5 shrink-0 animate-spin text-orange-700"
                  aria-hidden
                />
                Ich recherchiere den Hintergrund …
              </div>
            ) : (
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 sm:text-base">
                {paragraphsFromText(background).map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
              </div>
            )}
          </div>

          {more ? (
            <div className="mt-6 border-t border-zinc-950/10 pt-5">
              <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
                Noch mehr Wissen
              </p>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 sm:text-base">
                {paragraphsFromText(more).map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
              </div>
            </div>
          ) : null}

          {isLoadingMore ? (
            <div className="mt-6 flex items-center gap-3 border-t border-zinc-950/10 pt-5 text-sm font-semibold text-zinc-600">
              <Loader2
                className="size-5 shrink-0 animate-spin text-orange-700"
                aria-hidden
              />
              Ich hole noch mehr Details …
            </div>
          ) : null}
        </div>

        <div className="relative border-t border-zinc-950/10 px-5 py-4 sm:px-6">
          <BotGuardFields
            website={botGuard.website}
            onWebsiteChange={botGuard.setWebsite}
            formStartedAt={botGuard.formStartedAt}
          />
          {background && !more && allowMore ? (
            <button
              type="button"
              disabled={isLoadingMore || isLoadingWhy}
              onClick={handleMore}
              className="inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
            >
              Ich will mehr wissen
            </button>
          ) : (
            <p className="text-center text-xs font-semibold text-zinc-500">
              {more
                ? "Viel Spaß beim Staunen — schließ das Fenster, wenn du fertig bist."
                : allowMore
                  ? "Gleich kannst du noch tiefer eintauchen."
                  : "Schließ das Fenster, wenn du fertig bist."}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
