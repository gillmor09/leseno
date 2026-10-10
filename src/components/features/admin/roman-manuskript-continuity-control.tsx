"use client";

/**
 * Kontinuitäts-Pass (Gerüst / Plot / Manuskript):
 * Canon prüfen → Dialog → Übernehmen (hart).
 * Maße / Prop-Identität / Namens-Aliasse — kein Stil-Verbessern.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  romanManuskriptContinuityApplyAction,
  romanManuskriptContinuityScanAction,
} from "@/app/actions/roman-manuskript-continuity";
import type {
  ContinuityFix,
  ContinuityTarget,
} from "@/lib/roman/manuskript-continuity-pass";
import { CONTINUITY_TARGET_LABEL } from "@/lib/roman/manuskript-continuity-pass";
import type { RomanKontext } from "@/lib/roman/types";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ContinuityFix["kind"], string> = {
  mass: "Maß",
  identity: "Identität",
  name: "Name",
};

function ContinuityDialog({
  targetLabel,
  summary,
  fixes,
  selected,
  onToggle,
  onToggleAll,
  pending,
  onClose,
  onApply,
}: {
  targetLabel: string;
  summary: string;
  fixes: ContinuityFix[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  pending: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const selectedCount = selected.size;
  const allOn = selectedCount === fixes.length && fixes.length > 0;

  useEffect(() => {
    return lockBodyScroll();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="continuity-pass-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="flex max-h-[min(88vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2
              id="continuity-pass-title"
              className="text-lg font-extrabold tracking-tight text-zinc-950"
            >
              Kontinuität · {targetLabel}
            </h2>
            <p className="text-sm font-semibold text-zinc-600">
              Nur Canon-Fakten (Namen, Maße, Prop-Identität) im aktuellen
              Artefakt. Kein Stil-Schliff.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-sm font-semibold text-zinc-800">{summary}</p>
          {fixes.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-900/10">
              Nichts zu korrigieren — {targetLabel} und Canon passen zusammen.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  {selectedCount}/{fixes.length} gewählt
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onToggleAll(!allOn)}
                  className="text-xs font-extrabold tracking-wide text-orange-800 uppercase hover:underline disabled:opacity-50"
                >
                  {allOn ? "Keine" : "Alle"}
                </button>
              </div>
              <ul className="space-y-2">
                {fixes.map((fix) => {
                  const on = selected.has(fix.id);
                  return (
                    <li key={fix.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-colors",
                          on
                            ? "bg-orange-50/80 ring-orange-900/15"
                            : "bg-zinc-50 ring-zinc-950/8",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={() => onToggle(fix.id)}
                          className="mt-1 size-4 shrink-0 accent-orange-700"
                        />
                        <span className="min-w-0 space-y-1">
                          <span className="flex flex-wrap items-center gap-2 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                            <span>{KIND_LABEL[fix.kind]}</span>
                            <span>· Kap. {fix.chapter}</span>
                          </span>
                          <span className="block text-sm font-semibold text-zinc-900">
                            <span className="text-zinc-500 line-through">
                              {fix.find}
                            </span>
                            {" → "}
                            <span className="text-orange-950">{fix.replace}</span>
                          </span>
                          <span className="block text-xs font-medium text-zinc-600">
                            {fix.reason}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <footer className="border-t border-zinc-100 px-5 py-4">
          {fixes.length === 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Fertig
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || selectedCount < 1}
              onClick={onApply}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Übernehmen …
                </>
              ) : (
                `Übernehmen (${selectedCount})`
              )}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function RomanManuskriptContinuityControl({
  romanId,
  target = "manuskript",
  disabled,
  onComplete,
  className,
}: {
  romanId: string;
  /** Which artifact to scan/patch (Gerüst / Plot / Manuskript). */
  target?: ContinuityTarget;
  disabled?: boolean;
  /** Sync workspace after hard-apply. */
  onComplete?: (roman: RomanKontext) => void;
  className?: string;
}) {
  const [pending, setPending] = useState<"scan" | "apply" | null>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [fixes, setFixes] = useState<ContinuityFix[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const busy = Boolean(disabled || pending);
  const targetLabel = CONTINUITY_TARGET_LABEL[target];

  const selectedFixes = useMemo(
    () => fixes.filter((f) => selected.has(f.id)),
    [fixes, selected],
  );

  async function onScan() {
    if (busy) return;
    setPending("scan");
    try {
      const result = await romanManuskriptContinuityScanAction({
        romanId,
        target,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Kontinuitäts-Prüfung fehlgeschlagen.");
        return;
      }
      setSummary(result.data.summary);
      setFixes(result.data.fixes);
      setSelected(new Set(result.data.fixes.map((f) => f.id)));
      setOpen(true);
      if (result.data.fixes.length === 0) {
        toast.success(result.data.summary);
      }
    } catch {
      toast.error("Kontinuitäts-Prüfung fehlgeschlagen.");
    } finally {
      setPending(null);
    }
  }

  async function onApply() {
    if (busy || selectedFixes.length < 1) return;
    setPending("apply");
    try {
      const result = await romanManuskriptContinuityApplyAction({
        romanId,
        target,
        fixes: selectedFixes,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      toast.success(
        `${result.data.appliedCount} Canon-Korrektur${
          result.data.appliedCount === 1 ? "" : "en"
        } in ${targetLabel} übernommen.`,
      );
      setOpen(false);
      setFixes([]);
      setSelected(new Set());
      onComplete?.(result.data.roman);
    } catch {
      toast.error("Übernehmen fehlgeschlagen.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onScan()}
        className={cn(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/8 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50",
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {pending === "scan" ? (
            <Loader2
              className="size-4 shrink-0 animate-spin text-orange-700"
              aria-hidden
            />
          ) : (
            <Link2 className="size-4 shrink-0 text-orange-700" aria-hidden />
          )}
          <span className="min-w-0 truncate">
            Kontinuität ({targetLabel}): Maße, Namen, Identität
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold tracking-wide text-orange-800 uppercase">
          {pending === "scan" ? "Prüfen …" : "Prüfen"}
        </span>
      </button>

      {open ? (
        <ContinuityDialog
          targetLabel={targetLabel}
          summary={summary}
          fixes={fixes}
          selected={selected}
          pending={pending === "apply"}
          onToggle={(id) => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onToggleAll={(on) => {
            setSelected(on ? new Set(fixes.map((f) => f.id)) : new Set());
          }}
          onClose={() => {
            if (pending === "apply") return;
            setOpen(false);
          }}
          onApply={() => void onApply()}
        />
      ) : null}
    </>
  );
}
