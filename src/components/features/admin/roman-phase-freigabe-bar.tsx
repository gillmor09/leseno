/**
 * Author freigabe control for one process phase (canon ≠ Hard-Gate).
 * Replaces the former Fertig toggle for process stages.
 */

"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  approveRomanPhaseAction,
  revokeRomanPhaseAction,
} from "@/app/actions/roman-phase-freigabe";
import { fingerprintForPhase } from "@/lib/roman/phase-fingerprints";
import {
  getPhaseState,
  isPhaseApproved,
  PROCESS_PHASE_LABELS,
} from "@/lib/roman/phase-state";
import type { ProcessPhase } from "@/lib/roman/pipeline/stages";
import type { RomanEditorial } from "@/lib/roman/editorial";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

export function RomanPhaseFreigabeBar({
  roman,
  editorial,
  phase,
  canSave,
  onUpdated,
  /** Optional: custom approve (e.g. Manuskript Seam-Audit before canon). */
  onApprove,
}: {
  roman: RomanKontext;
  editorial: RomanEditorial;
  phase: ProcessPhase;
  canSave: boolean;
  onUpdated?: (roman: RomanKontext) => void;
  onApprove?: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const fp = fingerprintForPhase(phase, { ...roman, editorial });
  const entry = getPhaseState(editorial, phase);
  const approved = isPhaseApproved(editorial, phase, fp);
  // Approved status with drifted hash (legacy saves) → treat as prüfbedürftig.
  const fingerprintDrift =
    entry.status === "approved" &&
    Boolean(entry.fingerprint && fp && entry.fingerprint !== fp);
  const stale = entry.status === "stale" || fingerprintDrift;
  const label = PROCESS_PHASE_LABELS[phase] ?? phase;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm ring-1",
        approved
          ? "bg-emerald-50 text-emerald-950 ring-emerald-200"
          : stale
            ? "bg-amber-50 text-amber-950 ring-amber-200"
            : "bg-zinc-50 text-zinc-800 ring-zinc-950/10",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-extrabold">
          Autoren-Freigabe · {label}
          {approved ? " · freigegeben" : stale ? " · prüfbedürftig" : " · Entwurf"}
        </p>
        <p className="text-xs opacity-80">
          Hard-Gate prüft Qualität; Freigabe macht Kanon für Folgestufen.
          {entry.staleReason ? ` ${entry.staleReason}` : ""}
        </p>
      </div>
      {canSave ? (
        <div className="flex flex-wrap gap-2">
          {approved ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await revokeRomanPhaseAction({
                    romanId: roman.id,
                    phase,
                  });
                  if (!result.success || !result.data) {
                    toast.error(
                      result.error ?? "Freigabe zurücknehmen fehlgeschlagen.",
                    );
                    return;
                  }
                  onUpdated?.(result.data.roman);
                  toast.message(`Freigabe „${label}“ zurückgenommen.`);
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-100 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Freigabe zurücknehmen
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !fp}
              onClick={() => {
                startTransition(async () => {
                  if (onApprove) {
                    await onApprove();
                    return;
                  }
                  const result = await approveRomanPhaseAction({
                    romanId: roman.id,
                    phase,
                  });
                  if (!result.success || !result.data) {
                    toast.error(result.error ?? "Freigabe fehlgeschlagen.");
                    return;
                  }
                  onUpdated?.(result.data.roman);
                  toast.success(`„${label}“ freigegeben.`);
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Freigeben
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
