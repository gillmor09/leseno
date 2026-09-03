"use client";

/**
 * Free-tier story form: topic, school stage, length, mood.
 * Submit runs the two-stage Gemini pipeline (facts → story).
 */

import { useState, useTransition, type FormEvent } from "react";
import { BookOpen, BicepsFlexed, Lightbulb, Loader2, Smile, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { generateFreeStoryAction } from "@/app/actions/story-generate";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
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
  motivierend: BicepsFlexed,
} as const;

/**
 * Controlled composer for `/kostenlos`.
 * Collects inputs and fills the output pane via `generateFreeStoryAction`.
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
  const [learnedFacts, setLearnedFacts] = useState<string[]>([]);
  const [storySchoolStage, setStorySchoolStage] =
    useState<StorySchoolStageId | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setLearnedFacts([]);
    setStorySchoolStage(null);
    setStatusText("Hole passende Fakten …");

    startTransition(async () => {
      const result = await generateFreeStoryAction({
        topic,
        schoolStage,
        lengthStep,
        mood,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success || !result.data) {
        setStatusText(null);
        setFieldError(result.error ?? "Die Geschichte konnte nicht erzeugt werden.");
        toast.error(result.error ?? "Die Geschichte konnte nicht erzeugt werden.");
        return;
      }

      setStatusText(null);
      setOutput(result.data.story);
      setLearnedFacts(
        result.data.facts
          .map((fact) => (typeof fact === "string" ? fact.trim() : ""))
          .filter(Boolean),
      );
      setStorySchoolStage(schoolStage);
      toast.success("Geschichte ist fertig.");
    });
  }

  const storyTextClass = storyBodyClassName(storySchoolStage ?? schoolStage);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="relative rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
      >
        <BotGuardFields
          website={botGuard.website}
          onWebsiteChange={botGuard.setWebsite}
          formStartedAt={botGuard.formStartedAt}
        />
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
            disabled={isPending}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="z. B. ein mutiger Käfer am Vulkan"
            className="mt-3 w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-70"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPIC_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={isPending}
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

        <fieldset className="mt-8" disabled={isPending}>
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

        <fieldset className="mt-8" disabled={isPending}>
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

        {fieldError ? (
          <p className="mt-6 text-sm font-semibold text-orange-800">{fieldError}</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
            isPending && "opacity-70",
          )}
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-5" aria-hidden />
          )}
          {isPending ? "Geschichte entsteht …" : "Geschichte starten"}
        </button>
      </form>

      <div className="grid gap-6">
        <section
          aria-labelledby="story-output-heading"
          aria-busy={isPending}
          className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
        >
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Deine Geschichte
          </p>
          <h2
            id="story-output-heading"
            className="mt-1 text-xl font-extrabold text-zinc-950"
          >
            Frisch für dich geschrieben
          </h2>
          {isPending ? (
            <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-orange-50 px-4 py-6 ring-1 ring-orange-700/10">
              <Loader2 className="size-6 animate-spin text-orange-700" aria-hidden />
              <p className="text-sm font-semibold text-orange-900">
                {statusText ?? "Schreibe die Geschichte …"}
              </p>
              <p className="text-sm leading-relaxed text-zinc-600">
                Zuerst holen wir Fakten, danach formuliert die KI die Geschichte.
              </p>
            </div>
          ) : output ? (
            <p
              className={cn(
                "mt-4 whitespace-pre-wrap leading-relaxed text-zinc-700",
                storyTextClass,
              )}
            >
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

        {!isPending && learnedFacts.length > 0 ? (
          <section
            aria-labelledby="learned-facts-heading"
            className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
                <Lightbulb className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                  Wissen
                </p>
                <h2
                  id="learned-facts-heading"
                  className="mt-1 text-xl font-extrabold text-zinc-950"
                >
                  Das hast du gelernt
                </h2>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {learnedFacts.map((fact, index) => (
                <li
                  key={`${index}-${fact.slice(0, 24)}`}
                  className="flex gap-3 rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-700"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-700 text-xs font-extrabold text-white">
                    {index + 1}
                  </span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function storyBodyClassName(stage: StorySchoolStageId): string {
  // Base body is text-base; bump by school stage for easier reading.
  if (stage === "vorschule") {
    return "text-2xl sm:text-3xl";
  }
  if (stage === "klasse_1" || stage === "klasse_2") {
    return "text-xl sm:text-2xl";
  }
  return "text-lg sm:text-xl";
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
