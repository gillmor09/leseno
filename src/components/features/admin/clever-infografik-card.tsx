"use client";

/**
 * Clever Geschichten: generate / preview / clear chapter Abenteuer-Wissen infographic.
 * Click the preview to open a large dialog for reading painted labels.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import {
  cleverInfografikClearKapitelAction,
  cleverInfografikGenerateKapitelAction,
} from "@/app/actions/clever-unterthemen";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { CleverUnterthemen } from "@/lib/roman/clever-unterthemen";
import type { RomanKontext } from "@/lib/roman/types";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

export function CleverInfografikCard({
  romanId,
  kapitelNummer,
  dataUrl,
  modelLabel,
  generatedAt,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  kapitelNummer: number;
  dataUrl: string | null;
  modelLabel?: string;
  generatedAt?: string | null;
  canSave: boolean;
  disabled?: boolean;
  onComplete: (result: {
    roman: RomanKontext;
    unterthemen: CleverUnterthemen;
  }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const busy = Boolean(disabled || pending || clearPending);

  useEffect(() => {
    if (!previewOpen) return;
    return lockBodyScroll();
  }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  async function runGenerate() {
    if (!canSave || busy) return;
    setPending(true);
    try {
      const result = await cleverInfografikGenerateKapitelAction({
        romanId,
        kapitelNummer,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Infografik fehlgeschlagen.");
        return;
      }
      onComplete({
        roman: result.data.roman,
        unterthemen: result.data.unterthemen,
      });
      toast.success(`Infografik zu Geschichte ${kapitelNummer} gespeichert.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Infografik fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  }

  async function runClear() {
    if (!canSave || clearPending) return;
    setClearPending(true);
    try {
      const result = await cleverInfografikClearKapitelAction({
        romanId,
        kapitelNummer,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      onComplete(result.data);
      setClearOpen(false);
      setPreviewOpen(false);
      toast.success("Infografik gelöscht.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
      );
    } finally {
      setClearPending(false);
    }
  }

  return (
    <div className="rounded-2xl bg-sky-50 px-5 py-4 ring-1 ring-sky-200/80">
      <RomanSceneWaitDialog
        open={pending}
        variant="clever-infografik"
        progressLabel="Prompt → Infografik …"
      />
      <ConfirmDeleteDialog
        open={clearOpen}
        title="Infografik löschen?"
        description={`Die Infografik zu Geschichte ${kapitelNummer} wird entfernt. Abenteuer-Wissen und Prosa bleiben.`}
        confirmLabel="Infografik löschen"
        pending={clearPending}
        onCancel={() => {
          if (!clearPending) setClearOpen(false);
        }}
        onConfirm={() => void runClear()}
      />

      {previewOpen && dataUrl
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="clever-infografik-preview-title"
              className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/70 p-3 backdrop-blur-sm sm:p-6"
              onClick={() => setPreviewOpen(false)}
            >
              <div
                className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                      Infografik · Vergrößert
                    </p>
                    <h2
                      id="clever-infografik-preview-title"
                      className="text-lg font-extrabold text-zinc-950"
                    >
                      Geschichte {kapitelNummer}
                    </h2>
                    {(modelLabel || generatedAt) && (
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {modelLabel}
                        {generatedAt
                          ? ` · ${new Date(generatedAt).toLocaleString("de-DE")}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
                    aria-label="Schließen"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-zinc-100/80 p-3 sm:p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt={`Infografik Geschichte ${kapitelNummer} (groß)`}
                    className="mx-auto h-auto max-h-[calc(96vh-7rem)] w-auto max-w-full object-contain"
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-sky-900 uppercase">
            Infografik
          </p>
          <p className="mt-1 text-xs font-semibold text-sky-800/80">
            Ganzseitig 1200×1920 zur Geschichte — kurze deutsche Labels, lesbare
            Schrift. Nur Kapitel-Geschichte — kein Abenteuer-Wissen, keine
            Extra-Themen. Klick auf das Bild zum Vergrößern.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runGenerate()}
            className="rounded-full bg-sky-800 px-4 py-2 text-xs font-bold text-white hover:bg-sky-900 disabled:opacity-50"
          >
            {pending
              ? "Erzeugen …"
              : dataUrl
                ? "Neu erzeugen"
                : "Infografik erzeugen"}
          </button>
          {dataUrl ? (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => setClearOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
              title="Infografik löschen"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Infografik löschen</span>
            </button>
          ) : null}
        </div>
      </div>

      {dataUrl ? (
        <div className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-sky-100">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="group relative block w-full cursor-zoom-in text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2"
            title="Infografik vergrößern"
            aria-label={`Infografik Geschichte ${kapitelNummer} vergrößern`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt={`Infografik Geschichte ${kapitelNummer}`}
              className="mx-auto max-h-[28rem] w-full object-contain"
            />
            <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/75 px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-white uppercase opacity-90 transition group-hover:opacity-100">
              <ZoomIn className="size-3.5" aria-hidden />
              Vergrößern
            </span>
          </button>
          {(modelLabel || generatedAt) && (
            <p className="border-t border-sky-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
              {modelLabel}
              {generatedAt
                ? ` · ${new Date(generatedAt).toLocaleString("de-DE")}`
                : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-sky-900/70">
          Noch keine Infografik — aus den Fakten dieses Kapitels erzeugen.
        </p>
      )}
    </div>
  );
}
