"use client";

/**
 * Confirm dialog for destructive deletes (Abbrechen + destructive confirm).
 * Close only after success or when idle cancel / X.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

type ConfirmDeleteDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = "Löschen",
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
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
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      aria-describedby="confirm-delete-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="confirm-delete-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <button
            type="button"
            disabled={pending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            onClick={onCancel}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <p
          id="confirm-delete-desc"
          className="mt-3 text-sm leading-relaxed text-zinc-600"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {pending ? "Löscht …" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
