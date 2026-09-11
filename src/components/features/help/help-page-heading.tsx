"use client";

/**
 * Page H1 + optional page-level help trigger (slot `page`).
 */

import { HelpTrigger } from "@/components/features/help/help-trigger";
import { cn } from "@/lib/utils";

const DEFAULT_H1 =
  "mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]";

export function HelpPageHeading({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <h1 className={cn(DEFAULT_H1, className)}>{title}</h1>
      <HelpTrigger slotId="page" size="md" />
    </div>
  );
}
