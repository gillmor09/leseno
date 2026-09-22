"use client";

/**
 * Large dialog: story/roman export preview + PDF download.
 * Preview uses the export HTML (readable). Download uses the generated PDF Blob.
 * Blob PDFs in iframes often render blank (Chrome viewer + large files/covers).
 * No backdrop-filter — Chrome PDF plugins break under filter ancestors.
 * Close via X / Escape / outside click; footer „PDF speichern“.
 * Fullscreen toggle expands the panel edge-to-edge.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StoryPdfPreviewDialogProps = {
  open: boolean;
  /** Export HTML for the visual preview iframe. */
  previewHtml: string | null;
  /** Object URL for `application/pdf` download (revoked by parent on close). */
  pdfUrl: string | null;
  /** Download filename for „PDF speichern“. */
  downloadFileName?: string;
  /** Dialog heading under the PDF eyebrow. */
  heading?: string;
  onClose: () => void;
};

/**
 * Modal with HTML preview, fullscreen toggle, and PDF download action.
 */
export function StoryPdfPreviewDialog({
  open,
  previewHtml,
  pdfUrl,
  downloadFileName = "leseno-geschichte.pdf",
  heading = "Vorschau",
  onClose,
}: StoryPdfPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreviewReady(false);
      setIsSaving(false);
      setFullscreen(false);
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
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
        onClose();
      }
      if (
        (event.key === "f" || event.key === "F") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        setFullscreen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, fullscreen]);

  useLayoutEffect(() => {
    if (!open) {
      setPreviewReady(false);
      return;
    }

    // HTML preview only — do not set iframe src to the PDF blob (often blank).
    if (!previewHtml) {
      setPreviewReady(false);
      return;
    }
    setPreviewReady(false);
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(previewHtml);
    doc.close();

    let cancelled = false;
    void (async () => {
      try {
        if (doc.fonts?.ready) {
          await doc.fonts.ready;
        }
        await Promise.all(
          [
            doc.fonts?.load?.("400 16px Nunito"),
            doc.fonts?.load?.("600 16px Nunito"),
            doc.fonts?.load?.("700 16px Nunito"),
            doc.fonts?.load?.("800 16px Nunito"),
          ].filter(Boolean) as Promise<FontFace[]>[],
        );
      } catch {
        // Preview still usable with fallback fonts.
      }

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
      if (!cancelled) setPreviewReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, previewHtml]);

  if (!open) {
    return null;
  }

  const canSave = Boolean(pdfUrl);

  function handleSave() {
    if (!pdfUrl || !canSave || isSaving) return;
    setIsSaving(true);
    try {
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = downloadFileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      window.setTimeout(() => setIsSaving(false), 400);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-pdf-preview-title"
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60",
        fullscreen ? "p-0" : "p-3 sm:p-4",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          if (fullscreen) {
            setFullscreen(false);
            return;
          }
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-zinc-950/10",
          fullscreen
            ? "h-full w-full max-w-none rounded-none"
            : "h-[90vh] w-[90vw] max-w-[90vw] rounded-[1.75rem]",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              PDF
            </p>
            <h2
              id="story-pdf-preview-title"
              className="truncate text-lg font-extrabold text-zinc-950 sm:text-xl"
            >
              {heading}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              aria-label={
                fullscreen ? "Vollbild beenden" : "Vollbild öffnen"
              }
              title={fullscreen ? "Vollbild beenden (Esc)" : "Vollbild (F)"}
              className="inline-flex size-10 items-center justify-center rounded-full bg-gray-100 text-zinc-700 transition-all duration-200 ease-in-out hover:bg-zinc-200"
            >
              {fullscreen ? (
                <Minimize2 className="size-5" aria-hidden />
              ) : (
                <Maximize2 className="size-5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Vorschau schließen"
              className="inline-flex size-10 items-center justify-center rounded-full bg-gray-100 text-zinc-700 transition-all duration-200 ease-in-out hover:bg-zinc-200"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 bg-zinc-100">
          {!previewReady ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-100">
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
            title="PDF-Vorschau"
            className="h-full w-full border-0 bg-white"
          />
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-950/10 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold text-zinc-500">
            {fullscreen
              ? "Vollbild · Esc beendet Vollbild"
              : "F = Vollbild"}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
              (!canSave || isSaving) && "opacity-70",
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
