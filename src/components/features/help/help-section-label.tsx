"use client";

/**
 * Uppercase section eyebrow + card help trigger.
 */

import { HelpTrigger } from "@/components/features/help/help-trigger";
import { cn } from "@/lib/utils";

const DEFAULT_EYEBROW =
  "text-sm font-extrabold tracking-wide text-orange-700 uppercase";

export function HelpSectionLabel({
  title,
  slotId,
  className,
  labelClassName,
}: {
  title: string;
  slotId: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <p className={cn(DEFAULT_EYEBROW, labelClassName)}>{title}</p>
      <HelpTrigger slotId={slotId} />
    </div>
  );
}
