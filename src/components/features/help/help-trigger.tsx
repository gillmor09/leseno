"use client";

/**
 * Info icon that opens help for a catalog slot. Hidden when the slot has no content.
 */

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { HelpContentDialog } from "@/components/features/help/help-content-dialog";
import { useHelpSlot } from "@/components/features/help/help-texts-context";
import { cn } from "@/lib/utils";

type HelpTriggerProps = {
  slotId: string;
  className?: string;
  /** Larger hit target for page-level help next to the H1. */
  size?: "sm" | "md";
};

export function HelpTrigger({
  slotId,
  className,
  size = "sm",
}: HelpTriggerProps) {
  const entry = useHelpSlot(slotId);
  const [open, setOpen] = useState(false);

  if (!entry) return null;

  const iconClass = size === "md" ? "size-6" : "size-4";
  const btnClass =
    size === "md"
      ? "inline-flex size-10 items-center justify-center rounded-full"
      : "inline-flex size-8 items-center justify-center rounded-full";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          btnClass,
          "text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800",
          className,
        )}
        aria-label={`Hilfe: ${entry.title}`}
        title="Hilfe"
      >
        <HelpCircle className={iconClass} aria-hidden />
      </button>
      <HelpContentDialog
        open={open}
        title={entry.title}
        htmlBody={entry.htmlBody}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Title row helper: label + optional help trigger. */
export function HelpTitleRow({
  title,
  slotId,
  as: Tag = "h2",
  className,
  titleClassName,
}: {
  title: string;
  slotId: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Tag className={titleClassName}>{title}</Tag>
      <HelpTrigger slotId={slotId} size={Tag === "h1" ? "md" : "sm"} />
    </div>
  );
}
