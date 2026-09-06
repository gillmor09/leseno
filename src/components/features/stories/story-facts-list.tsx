"use client";

/**
 * Learned-facts list with per-fact „Warum?“ → FactWhyDialog (lazy-loaded).
 * Used on story composers; landing uses static markup instead.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { Lightbulb } from "lucide-react";
import type { StorySchoolStageId } from "@/lib/stories/options";
import { cn } from "@/lib/utils";

const FactWhyDialog = dynamic(
  () =>
    import("@/components/features/stories/fact-why-dialog").then(
      (mod) => mod.FactWhyDialog,
    ),
  { ssr: false },
);

type StoryFactsListProps = {
  facts: string[];
  schoolStage: StorySchoolStageId;
  /** Larger type for story result cards; compact for landing. */
  density?: "story" | "landing";
  className?: string;
  headingId?: string;
  showHeader?: boolean;
  /** When false, facts show without „Warum?“ / FactWhyDialog (e.g. trial). */
  allowFactWhy?: boolean;
  /** When false, hide „Ich will mehr wissen“ (package `hintergrund`). */
  allowFactWhyMore?: boolean;
};

/**
 * Numbered fact rows + optional Warum button; dialog uses school stage for age-appropriate wording.
 */
export function StoryFactsList({
  facts,
  schoolStage,
  density = "story",
  className,
  headingId = "learned-facts-heading",
  showHeader = true,
  allowFactWhy = true,
  allowFactWhyMore = true,
}: StoryFactsListProps) {
  const [activeFact, setActiveFact] = useState<string | null>(null);

  if (facts.length === 0) return null;

  const isStory = density === "story";

  return (
    <>
      <section
        aria-labelledby={showHeader ? headingId : undefined}
        className={cn(
          isStory
            ? "rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
            : undefined,
          className,
        )}
      >
        {showHeader ? (
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
              <Lightbulb className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
                Wissen
              </p>
              <h2
                id={headingId}
                className="mt-1 text-xl font-extrabold text-zinc-950"
              >
                Das hast du gelernt
              </h2>
            </div>
          </div>
        ) : null}

        <ul
          className={cn(
            showHeader ? "mt-5" : undefined,
            isStory ? "space-y-3" : "grid gap-3 sm:grid-cols-2",
          )}
        >
          {facts.map((fact, index) => (
            <li
              key={`${index}-${fact.slice(0, 24)}`}
              className={cn(
                "flex gap-3 rounded-2xl px-4 py-3",
                isStory
                  ? "bg-gray-100 text-lg leading-relaxed text-zinc-700 sm:text-xl"
                  : "bg-zinc-700 text-sm leading-relaxed font-semibold text-white",
              )}
            >
              {isStory ? (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-extrabold text-white">
                  {index + 1}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p>{fact}</p>
                {allowFactWhy ? (
                  <button
                    type="button"
                    onClick={() => setActiveFact(fact)}
                    className={cn(
                      "mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide uppercase transition-all duration-200 ease-in-out",
                      "bg-yellow-400 text-zinc-950 hover:bg-yellow-300",
                    )}
                  >
                    Warum?
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {allowFactWhy && activeFact ? (
        <FactWhyDialog
          open
          fact={activeFact}
          schoolStage={schoolStage}
          allowMore={allowFactWhyMore}
          onClose={() => setActiveFact(null)}
        />
      ) : null}
    </>
  );
}
