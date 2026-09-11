"use client";

/**
 * Dialog that shows sanitized help HTML for a page or card slot.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type HelpContentDialogProps = {
  open: boolean;
  title: string;
  htmlBody: string;
  onClose: () => void;
};

export function HelpContentDialog({
  open,
  title,
  htmlBody,
  onClose,
}: HelpContentDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(85vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-950/10 px-6 py-4">
          <h2
            id="help-dialog-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-gray-100 hover:text-zinc-950"
            aria-label="Schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div
          className="help-html overflow-y-auto px-6 py-5 text-sm leading-relaxed text-zinc-700 [&_.ql-size-huge]:text-[2.5em] [&_.ql-size-large]:text-[1.5em] [&_.ql-size-small]:text-[0.75em] [&_a]:font-semibold [&_a]:text-orange-700 [&_a]:underline [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-zinc-950 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-zinc-950 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-zinc-950 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          // Server-sanitized HTML from help loader.
          dangerouslySetInnerHTML={{ __html: htmlBody }}
        />
      </div>
    </div>,
    document.body,
  );
}
