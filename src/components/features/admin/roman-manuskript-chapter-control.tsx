"use client";

/**
 * Per-chapter Manuskript controls: Erzeugen / Verbessern / Gegenlesen.
 * Continuity (Gerüst + Vorgänger-Ende + storyState) lives server-side.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  romanManuskriptChapterCritiqueAction,
  romanManuskriptChapterGenerateAction,
  romanManuskriptChapterImproveAction,
} from "@/app/actions/roman-manuskript-chapter";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { countWords, formatWordCount } from "@/lib/roman/editorial";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import type { RomanKontext } from "@/lib/roman/types";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

type PendingKind = "generate" | "improve" | "critique" | null;

export function RomanManuskriptChapterControl({
  romanId,
  plotMarkdown,
  manuskriptMarkdown,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  /** Kapitelgerüst — source of chapter numbers/titles. */
  plotMarkdown: string;
  /** Current manuskript prose (may be empty slots). */
  manuskriptMarkdown: string;
  canSave: boolean;
  disabled?: boolean;
  onComplete?: (roman: RomanKontext) => void;
}) {
  const plotChapters = useMemo(
    () => parsePlotChapters(plotMarkdown),
    [plotMarkdown],
  );
  const msByNum = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of parsePlotChapters(manuskriptMarkdown)) {
      map.set(c.number, c.body);
    }
    return map;
  }, [manuskriptMarkdown]);

  const [chapterNumber, setChapterNumber] = useState<number>(
    () => plotChapters[0]?.number ?? 1,
  );
  const [pending, setPending] = useState<PendingKind>(null);
  const [critiqueDialog, setCritiqueDialog] = useState<{
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    if (plotChapters.length === 0) return;
    if (!plotChapters.some((c) => c.number === chapterNumber)) {
      setChapterNumber(plotChapters[0]!.number);
    }
  }, [plotChapters, chapterNumber]);

  const selected = plotChapters.find((c) => c.number === chapterNumber);
  const body = msByNum.get(chapterNumber) ?? "";
  const hasProse = body.trim().length > 40;
  const words = countWords(body);
  const busy = Boolean(disabled || pending);

  async function runGenerate() {
    if (!canSave || busy || !selected) return;
    setPending("generate");
    try {
      const result = await romanManuskriptChapterGenerateAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Kapitel erzeugen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kapitel erzeugen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runImprove() {
    if (!canSave || busy || !selected) return;
    if (!hasProse) {
      toast.error("Kapitel hat noch keine Prosa — zuerst erzeugen.");
      return;
    }
    setPending("improve");
    try {
      const result = await romanManuskriptChapterImproveAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Kapitel verbessern fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kapitel verbessern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runCritique() {
    if (!canSave || busy || !selected) return;
    if (!hasProse) {
      toast.error("Kapitel hat noch keine Prosa — zuerst erzeugen.");
      return;
    }
    setPending("critique");
    try {
      const result = await romanManuskriptChapterCritiqueAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Gegenlesen fehlgeschlagen.");
        return;
      }
      toast.success(result.data.summary);
      setCritiqueDialog({
        title: `Gegenlese · Kapitel ${chapterNumber}`,
        body: result.data.critiqueText,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gegenlesen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  if (plotChapters.length === 0) {
    return null;
  }

  const waitVariant =
    pending === "generate"
      ? ("manuskript-chapter-generate" as const)
      : pending === "improve"
        ? ("manuskript-chapter-improve" as const)
        : ("manuskript-chapter-critique" as const);

  return (
    <div className="space-y-3 rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/8">
      <RomanSceneWaitDialog open={pending != null} variant={waitVariant} />

      {critiqueDialog ? (
        <ChapterCritiqueDialog
          title={critiqueDialog.title}
          body={critiqueDialog.body}
          onClose={() => setCritiqueDialog(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Einzelkapitel
          </span>
          <select
            value={chapterNumber}
            disabled={busy}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
            className="w-full rounded-2xl bg-white px-3 py-2.5 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
          >
            {plotChapters.map((c) => {
              const prose = (msByNum.get(c.number) ?? "").trim();
              const mark = prose.length > 40 ? "· Prosa" : "· leer";
              return (
                <option key={c.number} value={c.number}>
                  Kap. {c.number} — {c.title || "ohne Titel"} {mark}
                </option>
              );
            })}
          </select>
        </label>
        <p className="pb-2.5 text-xs font-semibold text-zinc-500">
          {hasProse
            ? `${formatWordCount(words)} Wörter`
            : "Noch keine Prosa"}
          {chapterNumber > 1 ? " · Continuity vom Vorgänger-Ende" : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => void runGenerate()}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {pending === "generate"
            ? "Erzeugen …"
            : hasProse
              ? "Kapitel neu erzeugen"
              : "Kapitel erzeugen"}
        </button>
        <button
          type="button"
          disabled={!canSave || busy || !hasProse}
          onClick={() => void runImprove()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending === "improve" ? "Verbessern …" : "Kapitel verbessern"}
        </button>
        <button
          type="button"
          disabled={!canSave || busy || !hasProse}
          onClick={() => void runCritique()}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending === "critique" ? "Gegenlesen …" : "Kapitel gegenlesen"}
        </button>
      </div>
      <p className="text-xs font-semibold text-zinc-500">
        Nutzt Kapitelgerüst-Beats und das Ende des Vorgängers, damit Einzelkapitel
        wie aus einem Guss wirken. Spätere Kapitel ggf. danach neu erzeugen.
      </p>
    </div>
  );
}

function ChapterCritiqueDialog({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manuskript-chapter-critique-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="manuskript-chapter-critique-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          Nur Gegenlese — Speichern/Übernehmen läuft über Verbessern.
        </p>
        <pre className="mt-4 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/8">
          {body}
        </pre>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
