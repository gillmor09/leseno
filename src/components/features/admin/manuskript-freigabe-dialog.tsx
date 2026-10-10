"use client";

/**
 * Manuskript freigabe findings: Nachziehen (Co-Autor) · Trotzdem freigeben · Schließen.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { ManuskriptFreigabeFinding } from "@/lib/roman/editorial";

function findingLabel(f: ManuskriptFreigabeFinding): string {
  if (f.source === "emotion") return "Emotion";
  return f.kind === "payoff" ? "Payoff" : "Naht";
}

export function ManuskriptFreigabeDialog({
  open,
  findings,
  pending,
  pendingMode = null,
  onClose,
  onNachziehen,
  onTrotzdemFreigeben,
}: {
  open: boolean;
  findings: ManuskriptFreigabeFinding[];
  pending?: boolean;
  /** Which action is running — for button labels. */
  pendingMode?: "nachziehen" | "freigeben" | null;
  onClose: () => void;
  onNachziehen: () => void;
  onTrotzdemFreigeben: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || findings.length < 1) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="manuskript-freigabe-title"
      aria-describedby="manuskript-freigabe-desc"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="manuskript-freigabe-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            Hinweise vor dem Feinschliff
          </h2>
          <button
            type="button"
            disabled={pending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>

        <p
          id="manuskript-freigabe-desc"
          className="mt-3 text-sm leading-relaxed text-zinc-600"
        >
          Günstiger Assist-Check (kein Opus). Du kannst die Stellen jetzt mit
          dem Co-Autor nachziehen lassen — oder trotzdem freigeben.
        </p>

        <ol className="mt-4 max-h-[40vh] list-decimal space-y-2 overflow-y-auto pl-5 text-sm font-semibold text-zinc-800">
          {findings.map((f, i) => (
            <li key={`${f.source}-${i}-${f.chapterNumbers.join("-")}`}>
              <span className="text-amber-800">[{findingLabel(f)}]</span>
              {" "}
              Kap. {f.chapterNumbers.join(", ")}:{" "}
              <span className="font-semibold text-zinc-700">{f.summary}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100 disabled:opacity-50"
          >
            Schließen
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onTrotzdemFreigeben}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-zinc-200 disabled:opacity-70"
          >
            {pending && pendingMode === "freigeben" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {pending && pendingMode === "freigeben"
              ? "Freigeben …"
              : "Trotzdem freigeben"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onNachziehen}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
          >
            {pending && pendingMode === "nachziehen" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {pending && pendingMode === "nachziehen"
              ? "Nachziehen …"
              : "Hinweise nachziehen"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
