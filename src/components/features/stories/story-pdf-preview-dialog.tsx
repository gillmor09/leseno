"use client";

/**
 * Large preview of the print/PDF export document.
 * Shows the story HTML in an iframe; „PDF speichern“ opens the system print dialog
 * (choose „Als PDF speichern“) from that frame — close via X only.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StoryPdfPreviewDialogProps = {
  open: boolean;
  /** Full HTML from `buildStoryExportDocument`. */
  html: string | null;
  onClose: () => void;
};

/**
 * 90vw × 90vh modal with document preview and primary save action.
 */
export function StoryPdfPreviewDialog({
  open,
  html,
  onClose,
}: StoryPdfPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      setIsSaving(false);
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

  useLayoutEffect(() => {
    if (!open || !html) {
      setReady(false);
      return;
    }

    setReady(false);
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    let cancelled = false;
    void (async () => {
      const images = Array.from(doc.images);
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      if (!cancelled) {
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, html]);

  if (!open || !html) {
    return null;
  }

  async function handleSave() {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || !ready || isSaving) return;
    setIsSaving(true);
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => setIsSaving(false), 500);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-pdf-preview-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              PDF
            </p>
            <h2
              id="story-pdf-preview-title"
              className="text-lg font-extrabold text-zinc-950 sm:text-xl"
            >
              Vorschau
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Vorschau schließen"
            className="inline-flex size-10 items-center justify-center rounded-full bg-gray-100 text-zinc-700 transition-all duration-200 ease-in-out hover:bg-zinc-200"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-zinc-100">
          {!ready ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-100/90">
              <Loader2
                className="size-8 animate-spin text-orange-700"
                aria-hidden
              />
              <p className="text-sm font-semibold text-zinc-600">
                Vorschau wird geladen …
              </p>
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            title="PDF-Vorschau der Geschichte"
            className="h-full w-full border-0 bg-white"
          />
        </div>

        <footer className="flex shrink-0 justify-end border-t border-zinc-950/10 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={!ready || isSaving}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
              (!ready || isSaving) && "opacity-70",
            )}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="size-4" aria-hidden />
            )}
            PDF speichern
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
