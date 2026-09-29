"use client";

/**
 * Blocking wait dialog for Sachbuch KI work (elapsed time + soft checklist).
 * Prefer this over spinner-only buttons for any multi-second agent call.
 */

import { useEffect, useState } from "react";
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

export function SachbuchWaitDialog({
  open,
  title,
  steps,
  progressLabel,
  agentInfo,
  footer = "Bitte Fenster offen lassen — das kann einige Minuten dauern.",
}: {
  open: boolean;
  title: string;
  steps: readonly string[];
  progressLabel?: string | null;
  agentInfo?: SachbuchWaitAgentInfo | null;
  footer?: string;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [softStep, setSoftStep] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setElapsedSec(0);
      setSoftStep(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tick = window.setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1_000);
    const maxSoft = Math.max(0, steps.length - 2);
    const soft = window.setInterval(() => {
      setSoftStep((current) => (current < maxSoft ? current + 1 : current));
    }, 25_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(soft);
    };
  }, [open, steps.length]);

  if (!open) return null;

  const stepIndex = Math.min(softStep, Math.max(0, steps.length - 2));
  const statusText =
    progressLabel?.trim() || steps[stepIndex] || "KI arbeitet …";
  const barPct =
    steps.length > 0
      ? Math.round(((stepIndex + 1) / steps.length) * 100)
      : 15;

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
