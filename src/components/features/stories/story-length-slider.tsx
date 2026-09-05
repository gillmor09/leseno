"use client";

/**
 * Five-stop length slider. Targets come from `leseno.story_length_limits`
 * (used server-side); labels are the five named steps only.
 */

import { cn } from "@/lib/utils";
import type {
  StoryLengthCatalog,
  StoryLengthStepId,
} from "@/lib/stories/length";

type StoryLengthSliderProps = {
  catalog: StoryLengthCatalog;
  value: StoryLengthStepId;
  onChange: (stepId: StoryLengthStepId) => void;
  /** Step ids that stay visible but cannot be selected (e.g. trial limits). */
  disabledStepIds?: readonly StoryLengthStepId[];
};

export function StoryLengthSlider({
  catalog,
  value,
  onChange,
  disabledStepIds = [],
}: StoryLengthSliderProps) {
  const steps = catalog.steps;
  const disabled = new Set(disabledStepIds);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === value),
  );
  const percent = steps.length > 1 ? (index / (steps.length - 1)) * 100 : 0;

  function selectStep(stepId: StoryLengthStepId) {
    if (disabled.has(stepId)) return;
    onChange(stepId);
  }

  return (
    <div>
      <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
        Textlänge
      </p>

      <div className="mt-5 px-1">
        <label htmlFor="story-length" className="sr-only">
          Textlänge
        </label>
        <div className="relative h-8">
          <div className="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded-full bg-gray-100 ring-1 ring-zinc-950/10" />
          <div
            className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-orange-700"
            style={{ width: `${percent}%` }}
          />
          <input
            id="story-length"
            type="range"
            min={0}
            max={steps.length - 1}
            step={1}
            value={index}
            onChange={(event) => {
              const next = steps[Number(event.target.value)];
              if (next) {
                selectStep(next.id);
              }
            }}
            className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:shadow-md"
          />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1">
          {steps.map((step) => {
            const active = step.id === value;
            const isDisabled = disabled.has(step.id);
            return (
              <button
                key={step.id}
                type="button"
                disabled={isDisabled}
                onClick={() => selectStep(step.id)}
                title={
                  isDisabled
                    ? "Im kostenlosen Test nicht verfügbar"
                    : undefined
                }
                className={cn(
                  "rounded-xl px-1 py-1.5 text-center text-[0.7rem] leading-tight font-extrabold transition-all duration-200 ease-in-out sm:text-xs",
                  isDisabled && "cursor-not-allowed text-zinc-300 opacity-50",
                  !isDisabled &&
                    active &&
                    "bg-yellow-400 text-zinc-950",
                  !isDisabled &&
                    !active &&
                    "text-zinc-500 hover:bg-gray-100",
                )}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
