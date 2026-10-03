"use client";

/**
 * Inline Clever-erzählt reader: HTML export in an iframe, no download control.
 * Soft deterrents: context menu off, selection off, Ctrl/Cmd+S / +P blocked.
 */

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ProtectedBookReaderProps = {
  previewHtml: string;
  title: string;
  className?: string;
};

/**
 * Renders read-only book HTML; intentional soft copy protection only.
 */
export function ProtectedBookReader({
  previewHtml,
  title,
  className,
}: ProtectedBookReaderProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setReady(false);
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc || !previewHtml) return;

    doc.open();
    doc.write(previewHtml);
    doc.close();

    const blockContext = (event: Event) => {
      event.preventDefault();
    };
    const blockDrag = (event: Event) => {
      event.preventDefault();
    };
    doc.addEventListener("contextmenu", blockContext);
    doc.addEventListener("dragstart", blockDrag);

    let cancelled = false;
    void (async () => {
      try {
        if (doc.fonts?.ready) await doc.fonts.ready;
      } catch {
        // Fallback fonts are fine.
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
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      doc.removeEventListener("contextmenu", blockContext);
      doc.removeEventListener("dragstart", blockDrag);
    };
  }, [previewHtml]);

  function blockHotkeys(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] bg-white shadow-xl ring-1 ring-zinc-950/10",
        className,
      )}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={blockHotkeys}
      role="region"
      aria-label={`Buch lesen: ${title}`}
    >
      {!ready ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-50">
          <Loader2
            className="size-8 animate-spin text-orange-700"
            aria-hidden
          />
          <p className="text-sm font-semibold text-zinc-600">
            Buch wird geladen …
          </p>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={`Buch: ${title}`}
        sandbox="allow-same-origin"
        className="h-[min(78vh,920px)] w-full border-0 bg-white select-none"
        tabIndex={0}
      />
      <p className="border-t border-zinc-950/10 bg-zinc-50 px-4 py-2.5 text-center text-xs font-semibold text-zinc-500">
        Online lesen · Speichern und Rechtsklick sind deaktiviert
      </p>
    </div>
  );
}
