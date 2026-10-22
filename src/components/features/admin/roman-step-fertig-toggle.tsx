"use client";

/**
 * Per-pipeline-tab „Fertig“ toggle — soft-green tab chrome when on.
 * Does **not** bypass hard stage gates (see stageGateOverrides / „Trotzdem weiter“).
 */

import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn } from "@/lib/utils";

export function RomanStepFertigToggle({
  checked,
  disabled,
  pending,
  pendingLabel = "Speichern …",
  onCheckedChange,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  /** Shown instead of „Fertig“ while pending (e.g. Freigabe-Check). */
  pendingLabel?: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div
      title="Nur Tab-Chrome (grün). Öffnet keine Hard-Gates — dafür braucht es grünes Gate oder „Trotzdem weiter“."
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 ring-1 ring-zinc-950/8",
        checked && "bg-emerald-50 ring-emerald-200",
        className,
      )}
    >
      <span
        className={cn(
          "text-xs font-extrabold tracking-wide uppercase",
          checked ? "text-emerald-900" : "text-zinc-500",
        )}
      >
        {pending ? pendingLabel : "Fertig"}
      </span>
      <ToggleSwitch
        checked={checked}
        disabled={disabled || pending}
        aria-label={
          checked
            ? "Schritt als fertig markiert (nur Chrome, kein Hard-Gate)"
            : "Schritt als fertig markieren (nur Chrome, kein Hard-Gate)"
        }
        onCheckedChange={onCheckedChange}
        className={checked ? "!bg-emerald-500 !ring-emerald-500" : undefined}
      />
    </div>
  );
}
