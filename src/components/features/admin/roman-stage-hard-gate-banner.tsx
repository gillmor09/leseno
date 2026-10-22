/**
 * Hard-gate banner: blocks next-stage Erzeugen while red; Override is
 * separate from the Fertig toggle („Trotzdem weiter“ + reason → history).
 */

"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { setRomanStageGateOverrideAction } from "@/app/actions/roman-pipeline";
import type { StageGateKey } from "@/lib/roman/editorial";
import type { StageHardGateResult } from "@/lib/roman/stage-hard-gates";
import type { RomanKontext } from "@/lib/roman/types";

export function RomanStageHardGateBanner({
  romanId,
  gateKey,
  gate,
  canSave,
  onUpdated,
}: {
  romanId: string;
  gateKey: StageGateKey;
  gate: StageHardGateResult;
  canSave: boolean;
  onUpdated?: (roman: RomanKontext) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

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
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const errors = gate.findings.filter((f) => f.severity === "error");
  if (gate.ok && !gate.viaOverride) return null;
  if (gate.ok && gate.viaOverride) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-500/30">
        Hard-Gate mit Override — Folgestufen sind freigegeben. Fertig-Toggle
        bleibt separat (nur Chrome).
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm ring-1 ring-rose-500/30">
        <p className="font-extrabold text-rose-900">{gate.summary}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-rose-900/80">
          {errors.slice(0, 6).map((e) => (
            <li key={`${e.code}-${e.message.slice(0, 40)}`}>{e.message}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-rose-900/70">
          Nächste Stufe bleibt blockiert, bis das Gate grün ist (Erzeugen /
          Auto-Repair) oder du explizit „Trotzdem weiter“ setzt — nicht über
          Fertig.
        </p>
        {canSave ? (
          <button
            type="button"
            disabled={pending}
            className="mt-2 inline-flex items-center rounded-full bg-white px-3 py-1.5 text-sm font-bold text-rose-900 ring-1 ring-rose-300 transition hover:bg-rose-100 disabled:opacity-50"
            onClick={() => setOpen(true)}
          >
            Trotzdem weiter …
          </button>
        ) : null}
      </div>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="stage-gate-override-title"
              className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
              onClick={() => {
                if (!pending) setOpen(false);
              }}
            >
              <div
                className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="stage-gate-override-title"
                    className="text-xl font-extrabold text-zinc-950"
                  >
                    Hard-Gate überschreiben?
                  </h2>
                  <button
                    type="button"
                    disabled={pending}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
                    onClick={() => setOpen(false)}
                    aria-label="Schließen"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  Folgestufen werden trotz offener Logik-/Canon-Findings
                  freigegeben. Grund wird in der Pipeline-Historie
                  protokolliert. Das ist kein Fertig-Toggle.
                </p>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Kurzer Grund (Pflicht) …"
                  rows={3}
                  className="mt-4 w-full rounded-2xl border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-orange-400"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={pending || reason.trim().length < 8}
                    className="inline-flex items-center rounded-full bg-orange-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-orange-700 disabled:opacity-50"
                    onClick={() => {
                      startTransition(async () => {
                        const result = await setRomanStageGateOverrideAction({
                          romanId,
                          gateKey,
                          reason: reason.trim(),
                        });
                        if (!result.success || !result.data) {
                          toast.error(
                            result.error ?? "Override fehlgeschlagen.",
                          );
                          return;
                        }
                        onUpdated?.(result.data.roman);
                        toast.message(
                          "Override gesetzt — Folgestufe freigegeben.",
                        );
                        setOpen(false);
                        setReason("");
                      });
                    }}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Speichern …
                      </>
                    ) : (
                      "Trotzdem weiter"
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Map UI tab → gate key for the *current* stage (banner on that tab). */
export function gateKeyForPipelineTab(tab: string): StageGateKey | null {
  if (tab === "idee") return "idee";
  if (tab === "typ" || tab === "rahmen") return "rahmen";
  if (tab === "fundament") return "fundament";
  if (tab === "spec" || tab === "expose") return "expose";
  if (tab === "graph") return "graph";
  if (
    tab === "plot" ||
    tab === "feingeruest" ||
    tab === "grobgeruest" ||
    tab === "kapitelgeruest"
  ) {
    return "plot";
  }
  if (
    tab === "szenen" ||
    tab === "feinplot" ||
    tab === "grobplot" ||
    tab === "szenenplot" ||
    tab === "outline"
  ) {
    return "szenen";
  }
  if (tab === "schreiben") return "schreiben";
  return null;
}

/** Prerequisite gate key that must be green before starting this tab’s Erzeugen. */
export function prerequisiteGateKeyForTab(tab: string): StageGateKey | null {
  if (tab === "typ" || tab === "rahmen") return "idee";
  if (tab === "fundament") return "rahmen";
  if (tab === "spec" || tab === "expose") return "fundament";
  if (tab === "graph") return "expose";
  if (
    tab === "plot" ||
    tab === "grobgeruest" ||
    tab === "feingeruest" ||
    tab === "kapitelgeruest"
  ) {
    return "graph";
  }
  if (
    tab === "szenen" ||
    tab === "outline" ||
    tab === "grobplot" ||
    tab === "feinplot" ||
    tab === "szenenplot"
  ) {
    return "plot";
  }
  if (tab === "schreiben") return "szenen";
  return null;
}
