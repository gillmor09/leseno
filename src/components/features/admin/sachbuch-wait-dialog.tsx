"use client";

/**
 * Blocking wait dialog for Sachbuch KI work.
 * Shows wall-clock Laufzeit (not an ETA) + soft checklist.
 * When `progressLabel` contains `Kapitel i/n`, the bar uses that fraction
 * instead of the timer-based soft steps (which otherwise look “almost done”
 * while a single Argon chapter rewrite can run ~20 min).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

export type SachbuchWaitAgentInfo = {
  roleLabel: string;
  modelLabel: string;
};

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Prefer real hop progress: `Kapitel 2/6: …` or `Kapitel 2/6 übersprungen`. */
function parseKapitelProgress(
  label: string | null | undefined,
): { current: number; total: number } | null {
  if (!label) return null;
  const m = label.match(/Kapitel\s+(\d+)\s*\/\s*(\d+)/i);
  if (!m) return null;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) {
    return null;
  }
  return { current: Math.max(1, current), total };
}

export function SachbuchWaitDialog({
  open,
  title,
  steps,
  progressLabel,
  agentInfo,
  /** Wall-clock start from parent — survives dialog remounts (HMR / re-render). */
  startedAtMs = null,
  footer = "Bitte Fenster offen lassen — das kann einige Minuten dauern.",
}: {
  open: boolean;
  title: string;
  steps: readonly string[];
  progressLabel?: string | null;
  agentInfo?: SachbuchWaitAgentInfo | null;
  startedAtMs?: number | null;
  footer?: string;
}) {
  const localStartedAtRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [softStep, setSoftStep] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      localStartedAtRef.current = null;
      setElapsedSec(0);
      setSoftStep(0);
    } else if (startedAtMs == null) {
      localStartedAtRef.current = Date.now();
    }
  }

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (startedAtMs == null && localStartedAtRef.current == null) {
      localStartedAtRef.current = Date.now();
    }
    const tick = window.setInterval(() => {
      const start = startedAtMs ?? localStartedAtRef.current ?? Date.now();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1_000);
    // Soft checklist only when we have no real Kapitel i/n progress.
    const maxSoft = Math.max(0, steps.length - 2);
    const soft = window.setInterval(() => {
      setSoftStep((current) => (current < maxSoft ? current + 1 : current));
    }, 25_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(soft);
    };
  }, [open, steps.length, startedAtMs]);

  if (!open) return null;

  const kapitelProg = parseKapitelProgress(progressLabel);
  const scoringBook = /Verkaufsreife|Buch-Score|Buch-Verkaufsreife/i.test(
    progressLabel ?? "",
  );
  const startingHops = /Starte|ermittelt/i.test(progressLabel ?? "");

  let stepIndex = Math.min(softStep, Math.max(0, steps.length - 2));
  let barPct =
    steps.length > 0
      ? Math.round(((stepIndex + 1) / steps.length) * 100)
      : 15;

  if (kapitelProg) {
    // Mid-chapter: show (current-1)/total … current/total, not “almost done”.
    const frac = (kapitelProg.current - 0.35) / kapitelProg.total;
    barPct = Math.max(5, Math.min(92, Math.round(frac * 100)));
    // Checklist: hop step (index 1) while chapters run; last-but-one for score.
    stepIndex = Math.min(1, Math.max(0, steps.length - 2));
  } else if (scoringBook && steps.length > 0) {
    stepIndex = Math.max(0, steps.length - 2);
    barPct = Math.round(((stepIndex + 1) / steps.length) * 100);
  } else if (startingHops) {
    stepIndex = 0;
    barPct = Math.round((1 / Math.max(1, steps.length)) * 100);
  }

  const statusText =
    progressLabel?.trim() || steps[stepIndex] || "KI arbeitet …";

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sachbuch-wait-title"
      aria-describedby="sachbuch-wait-desc"
      aria-busy="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2
            className="size-10 animate-spin text-orange-700"
            aria-hidden
          />
          <h2
            id="sachbuch-wait-title"
            className="mt-5 text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <p className="mt-2 font-mono text-sm font-extrabold tracking-wide text-orange-800">
            <span className="mr-1.5 font-sans text-[0.7rem] font-bold uppercase tracking-wider text-orange-700/80">
              Laufzeit
            </span>
            {formatElapsed(elapsedSec)}
          </p>
          <p
            id="sachbuch-wait-desc"
            className="mt-2 text-sm font-extrabold text-zinc-900"
          >
            {statusText}
          </p>
          {agentInfo?.roleLabel ? (
            <p className="mt-2 max-w-sm text-xs font-semibold leading-snug text-zinc-600">
              <span className="font-extrabold text-zinc-900">
                {agentInfo.roleLabel}
              </span>
              {agentInfo.modelLabel ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{agentInfo.modelLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="mt-3 text-xs font-semibold text-zinc-500">{footer}</p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600 transition-[width] duration-700 ease-out"
              style={{ width: `${barPct}%` }}
            />
          </div>
          {steps.length > 0 ? (
            <ol className="mt-5 w-full space-y-1.5 text-left text-xs font-semibold text-zinc-500">
              {steps.map((label, index) => (
                <li
                  key={label}
                  className={
                    index < stepIndex
                      ? "text-orange-800"
                      : index === stepIndex
                        ? "font-extrabold text-zinc-950"
                        : "text-zinc-400"
                  }
                >
                  {index < stepIndex ? "✓" : index === stepIndex ? "→" : "·"}{" "}
                  {label.replace(/ …$/, "")}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
