"use client";

import { cn } from "@/lib/utils";

/**
 * Accessible on/off control for story options (e.g. conflict depth).
 * Keyboard: Space / Enter toggles when focused.
 */
export function ToggleSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label": string;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full ring-1 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-yellow-400 ring-yellow-400"
          : "bg-zinc-200 ring-zinc-950/10",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
