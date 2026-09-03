"use client";

/**
 * Five-stop length slider. Word bands come from `leseno.story_length_limits`
 * and change when the selected age switches group (5–7 vs 8–10).
 */

import { cn } from "@/lib/utils";
import {
  findLengthLimit,
  formatWordRange,
  type StoryLengthCatalog,
  type StoryLengthStepId,
} from "@/lib/stories/length";
import type { StorySchoolStageId } from "@/lib/stories/options";

type StoryLengthSliderProps = {
  schoolStage: StorySchoolStageId;
  catalog: StoryLengthCatalog;
  value: StoryLengthStepId;
  onChange: (stepId: StoryLengthStepId) => void;
};

export function StoryLengthSlider({
  schoolStage,
  catalog,
  value,
  onChange,
}: StoryLengthSliderProps) {
  const steps = catalog.steps;
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === value),
  );
  const current = steps[index];
  const limit = current
    ? findLengthLimit(catalog, schoolStage, current.id)
    : undefined;
  const percent = steps.length > 1 ? (index / (steps.length - 1)) * 100 : 0;

  return (
    <fieldset>
      <legend className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
        Textlänge
      </legend>
      <p className="mt-1 text-sm text-zinc-600">
        Schiebt den Regler — von einem Kurzspaß bis zur langen Vorlesegeschichte.
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
                onChange(next.id);
              }
            }}
            className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:shadow-md"
          />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1">
          {steps.map((step) => {
            const active = step.id === value;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onChange(step.id)}
                className={cn(
                  "rounded-xl px-1 py-1.5 text-center text-[0.7rem] leading-tight font-extrabold transition-all duration-200 ease-in-out sm:text-xs",
                  active ? "bg-yellow-400 text-zinc-950" : "text-zinc-500 hover:bg-gray-100",
                )}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-700">
        {current?.label ?? "Länge"} · {formatWordRange(limit)}
      </p>
    </fieldset>
  );
}
