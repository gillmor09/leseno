"use client";

/**
 * Free-tier story form: topic, school stage, length, mood.
 * Submit is a UI stub — generation will attach here later (no API yet).
 */

import { useState, type FormEvent } from "react";
import { BookOpen, Lightbulb, Smile, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  STORY_SCHOOL_STAGES,
  STORY_MOODS,
  TOPIC_EXAMPLES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";

const moodIcons = {
  lustig: Smile,
  spannend: Zap,
  informativ: Lightbulb,
} as const;

/**
 * Controlled composer for `/kostenlos`. Collects inputs only; story text stays empty until generation exists.
 */
export function FreeStoryForm({
  lengthCatalog,
}: {
  lengthCatalog: StoryLengthCatalog;
}) {
  const [topic, setTopic] = useState("");
  const [schoolStage, setSchoolStage] =
    useState<StorySchoolStageId>("klasse_3");
  const [lengthStep, setLengthStep] = useState<StoryLengthStepId>("mittel");
  const [mood, setMood] = useState<StoryMoodId>("spannend");
  const [output, setOutput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Generation will replace this stub and write into `output`.
    setOutput("");
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-5 lg:gap-10">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8 lg:col-span-3"
      >
        <div>
          <label
            htmlFor="story-topic"
            className="text-sm font-extrabold tracking-wide text-orange-700 uppercase"
          >
            Thema
          </label>
          <p className="mt-1 text-sm text-zinc-600">
            Worum soll die Geschichte gehen? Ein Wort reicht — oder ein ganzer Satz.
          </p>
          <textarea
            id="story-topic"
            name="topic"
            rows={3}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="z. B. ein mutiger Käfer am Vulkan"
            className="mt-3 w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-orange-700"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPIC_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setTopic(example)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                  topic === example
                    ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                    : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="mt-8">
          <legend className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Schulstufe
          </legend>
          <p className="mt-1 text-sm text-zinc-600">
            Damit Sprache und Umfang zum Leseniveau im Alltag passen.
          </p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Schulstufe"
          >
            {STORY_SCHOOL_STAGES.map((stage) => (
              <ChoiceChip
                key={stage.id}
                active={schoolStage === stage.id}
                onClick={() => setSchoolStage(stage.id)}
                label={stage.label}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-8">
          <StoryLengthSlider
            schoolStage={schoolStage}
            catalog={lengthCatalog}
            value={lengthStep}
            onChange={setLengthStep}
          />
        </div>

        <fieldset className="mt-8">
          <legend className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Art der Geschichte
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {STORY_MOODS.map((item) => {
              const Icon = moodIcons[item.id];
              const active = mood === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMood(item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-extrabold ring-1 transition-all duration-200 ease-in-out sm:flex-col sm:items-start sm:gap-3",
                    active
                      ? "bg-orange-700 text-white ring-orange-700"
                      : "bg-gray-100 text-zinc-950 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full",
                      active ? "bg-yellow-400 text-zinc-950" : "bg-white text-orange-700",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          type="submit"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
        >
          <Sparkles className="size-5" aria-hidden />
          Geschichte starten
        </button>
      </form>

      <section
        aria-labelledby="story-output-heading"
        className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8 lg:col-span-2"
      >
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Eure Geschichte
        </p>
        <h2 id="story-output-heading" className="mt-1 text-xl font-extrabold text-zinc-950">
          Zum Vorlesen
        </h2>
        {output ? (
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-zinc-700">
            {output}
          </p>
        ) : (
          <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-gray-100 px-4 py-6">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-zinc-600">
              Hier erscheint die Geschichte — mit echten Fakten dazwischen.
              Wählt ein Thema und startet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ChoiceChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
        active
          ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
          : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}
