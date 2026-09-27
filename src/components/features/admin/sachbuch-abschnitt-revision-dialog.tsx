"use client";

/**
 * Shows what an Abschnitt pipeline step changed (before / after + summary).
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { SachbuchAbschnittRevision } from "@/lib/sachbuch/types";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

export function SachbuchAbschnittRevisionDialog({
  revision,
  abschnittLabel,
  onClose,
}: {
  revision: SachbuchAbschnittRevision | null;
  abschnittLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!revision) return;
    return lockBodyScroll();
  }, [revision]);

  useEffect(() => {
    if (!revision) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revision, onClose]);

  if (!revision) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sachbuch-revision-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
              {abschnittLabel} · {revision.label}
            </p>
            <h2
              id="sachbuch-revision-title"
              className="text-lg font-extrabold text-zinc-950"
            >
              Was wurde geändert?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
            aria-label="Schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {revision.summary.trim() ? (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Änderungen
              </h3>
              <pre className="whitespace-pre-wrap rounded-2xl bg-amber-50/80 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-amber-200/70">
                {revision.summary}
              </pre>
            </section>
          ) : null}

          {revision.meta.trim() ? (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Kontext
              </h3>
              <pre className="whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-950/5">
                {revision.meta}
              </pre>
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Vorher
              </h3>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-zinc-50 px-4 py-3 text-xs font-semibold leading-relaxed text-zinc-700 ring-1 ring-zinc-950/5">
                {revision.beforeText || "—"}
              </pre>
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-emerald-800 uppercase">
                Nachher
              </h3>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-emerald-50/70 px-4 py-3 text-xs font-semibold leading-relaxed text-zinc-900 ring-1 ring-emerald-200/80">
                {revision.afterText || "—"}
              </pre>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
