"use client";

/**
 * Blocking wait dialog for Phase 0 roadmap or Phase 1–3 scene writing.
 * Mid-flight cancel is impossible; batch mode can stop after the current scene.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SCENE_STEPS = [
  "Nächste Szene wird vorbereitet …",
  "KI-Autor schreibt den Entwurf …",
  "Lektor und Testleser prüfen parallel …",
  "Autor überarbeitet die Szene …",
  "Zusammenfassung wird angehängt …",
] as const;

const ROADMAP_STEPS = [
  "Manuskript und Fundament werden gelesen …",
  "KI zerlegt den Plot in Szenen …",
  "Roadmap wird gespeichert …",
] as const;

type RomanSceneWaitDialogProps = {
  open: boolean;
  /** Phase 0 roadmap vs Phase 1–3 scene writing. */
  variant?: "scene" | "roadmap";
  /** Batch mode: show overall progress + optional stop. */
  batch?: boolean;
  /** e.g. „Szene 3 von 40 wird geschrieben …“ */
  progressLabel?: string | null;
  /** User asked to stop after the in-flight scene. */
  stopAfterCurrent?: boolean;
  onRequestStopAfterCurrent?: () => void;
};

export function RomanSceneWaitDialog({
  open,
  variant = "scene",
  batch = false,
  progressLabel = null,
  stopAfterCurrent = false,
  onRequestStopAfterCurrent,
}: RomanSceneWaitDialogProps) {
  const steps = variant === "roadmap" ? ROADMAP_STEPS : SCENE_STEPS;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const intervalMs = variant === "roadmap" ? 8_000 : 12_000;
    const timer = window.setInterval(() => {
      setStepIndex((current) =>
        current < steps.length - 1 ? current + 1 : current,
      );
    }, intervalMs);
    return () => {
      document.body.style.overflow = previous;
      window.clearInterval(timer);
    };
  }, [open, variant, steps.length]);

  // Reset inner step animation when a new batch scene starts.
  useEffect(() => {
    if (!open || !batch || variant !== "scene") return;
    setStepIndex(0);
  }, [open, batch, progressLabel, variant]);

  if (!open) return null;

  const title =
    variant === "roadmap"
      ? "Szenen-Roadmap wird erzeugt"
      : batch
        ? "Roman wird geschrieben"
        : "Szene wird geschrieben";

  const footerHint =
    variant === "roadmap"
      ? "Das kann 1–3 Minuten dauern. Bitte diesen Tab offen lassen — Abbrechen ist nicht möglich."
      : batch
        ? "Szenen laufen nacheinander. Tab offen lassen. Stoppen gilt erst nach der aktuellen Szene."
        : "Das kann einige Minuten dauern. Bitte diesen Tab offen lassen — Abbrechen ist nicht möglich.";

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="roman-scene-wait-title"
      aria-describedby="roman-scene-wait-desc"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2
            className="size-10 animate-spin text-orange-700"
            aria-hidden
          />
          <h2
            id="roman-scene-wait-title"
            className="mt-5 text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          {progressLabel && variant === "scene" ? (
            <p className="mt-2 text-sm font-extrabold text-orange-800">
              {progressLabel}
            </p>
          ) : null}
          <p
            id="roman-scene-wait-desc"
            className="mt-2 text-sm font-semibold text-zinc-600"
          >
            {steps[stepIndex]}
          </p>
          <p className="mt-4 text-xs font-semibold text-zinc-500">
            {footerHint}
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600 transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%`,
              }}
            />
          </div>
          <ol className="mt-5 w-full space-y-1.5 text-left text-xs font-semibold text-zinc-500">
            {steps.map((label, index) => (
              <li
                key={label}
                className={
                  index <= stepIndex ? "text-orange-800" : "text-zinc-400"
                }
              >
                {index < stepIndex ? "✓" : index === stepIndex ? "→" : "·"}{" "}
                {label.replace(/ …$/, "")}
              </li>
            ))}
          </ol>

          {variant === "scene" && batch && onRequestStopAfterCurrent ? (
            <button
              type="button"
              disabled={stopAfterCurrent}
              onClick={onRequestStopAfterCurrent}
              className={cn(
                "mt-6 rounded-full px-5 py-2.5 text-sm font-bold ring-1 ring-zinc-950/10",
                stopAfterCurrent
                  ? "bg-amber-50 text-amber-900 opacity-90"
                  : "bg-gray-100 text-zinc-800 hover:bg-white",
              )}
            >
              {stopAfterCurrent
                ? "Stoppt nach dieser Szene …"
                : "Nach aktueller Szene stoppen"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
