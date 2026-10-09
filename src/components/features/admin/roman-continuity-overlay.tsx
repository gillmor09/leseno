"use client";

/**
 * Read-only overlay for Manuskript Continuity (`editorial.storyState`) —
 * runtime pointer after the last written chapter (Ort, Fäden, Fakten, …).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GitBranch, X } from "lucide-react";
import type { RomanStoryState } from "@/lib/roman/editorial";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

function formatUpdatedAt(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Date(d).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function ListBlock({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
        {title} · {items.length}
      </h3>
      <ul className="space-y-1.5">
        {items.map((line, i) => (
          <li
            key={`${i}-${line.slice(0, 24)}`}
            className="rounded-2xl bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/8"
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RomanContinuityTrigger({
  storyState,
  className,
}: {
  storyState: RomanStoryState | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasState = Boolean(storyState && storyState.afterChapter >= 0);

  if (!hasState || !storyState) {
    return (
      <p className={cn("text-sm font-semibold text-zinc-600", className)}>
        Continuity entsteht beim Manuskript-Schreiben (nach jedem Kapitel) und
        steuert den Übergang zum nächsten Kapitel.
      </p>
    );
  }

  const factCount =
    storyState.hardFacts.length +
    storyState.openThreads.length +
    storyState.presentCharacters.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/8 transition-colors hover:bg-zinc-100 hover:text-zinc-950",
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <GitBranch className="size-4 shrink-0 text-orange-700" aria-hidden />
          <span className="min-w-0 truncate">
            Continuity: nach Kap. {storyState.afterChapter}
            {storyState.location.trim()
              ? ` · ${storyState.location.trim().slice(0, 48)}`
              : ""}
            {factCount > 0 ? ` · ${factCount} Merkpunkte` : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold tracking-wide text-orange-800 uppercase">
          Ansehen
        </span>
      </button>
      <RomanContinuityOverlay
        open={open}
        storyState={storyState}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function RomanContinuityOverlay({
  open,
  storyState,
  onClose,
}: {
  open: boolean;
  storyState: RomanStoryState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
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
      aria-labelledby="roman-continuity-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Manuskript · Runtime nach Kapitel {storyState.afterChapter}
            </p>
            <h2
              id="roman-continuity-title"
              className="text-lg font-extrabold text-zinc-950"
            >
              Continuity
            </h2>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Stand {formatUpdatedAt(storyState.updatedAt)} · steuert den
              Übergang zum nächsten Kapitel (nicht der Wissensgraph)
            </p>
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
          {(storyState.location.trim() || storyState.mood.trim()) && (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Situation
              </h3>
              <div className="rounded-2xl bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/8">
                {storyState.location.trim() ? (
                  <p>
                    <span className="text-zinc-500">Ort: </span>
                    {storyState.location}
                  </p>
                ) : null}
                {storyState.mood.trim() ? (
                  <p className={storyState.location.trim() ? "mt-1" : undefined}>
                    <span className="text-zinc-500">Stimmung: </span>
                    {storyState.mood}
                  </p>
                ) : null}
              </div>
            </section>
          )}

          <ListBlock title="Anwesend" items={storyState.presentCharacters} />
          <ListBlock title="Harte Fakten" items={storyState.hardFacts} />
          <ListBlock title="Offene Fäden" items={storyState.openThreads} />
          <ListBlock
            title="Wissen / Geheimnisse"
            items={storyState.secretsAndKnowledge}
          />
          <ListBlock
            title="Gegenstände / Props"
            items={storyState.inventoryAndProps}
          />
          <ListBlock title="Beziehungen" items={storyState.relationshipNotes} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
