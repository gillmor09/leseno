"use client";

/**
 * Free-tier story form: Top-10 topic or „Ganz persönlich“, school stage, length, mood.
 * Full-screen wait overlay while generating; selection card collapses when ready.
 * PDF via print dialog with HTML that mirrors on-screen layout.
 */

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  BicepsFlexed,
  ChevronDown,
  FileDown,
  Lightbulb,
  Loader2,
  Smile,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { generateFreeStoryAction } from "@/app/actions/story-generate";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { cn } from "@/lib/utils";
import { StoryHtmlBody } from "@/components/features/stories/story-html-body";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  exportFontSizeForSchoolStage,
  openStoryPrintDialog,
} from "@/lib/stories/export-story-document";
import {
  STORY_SCHOOL_STAGES,
  STORY_MOODS,
  STORY_TOP_TOPICS,
  type StoryMoodId,
  type StorySchoolStageId,
  type StoryTopTopic,
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
  personalAvailable = false,
}: {
  lengthCatalog: StoryLengthCatalog;
  /** True when Meine Welt has name + interest/wish for personal mode. */
  personalAvailable?: boolean;
}) {
  const [topic, setTopic] = useState<StoryTopTopic | "">(
    STORY_TOP_TOPICS[0],
  );
  const [personalMode, setPersonalMode] = useState(false);
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
  const [selectionExpanded, setSelectionExpanded] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [portalReady, setPortalReady] = useState(false);
  const botGuard = useBotGuardFields();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isPending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isPending]);

  function selectTopic(next: StoryTopTopic) {
    setPersonalMode(false);
    setTopic(next);
  }

  function togglePersonal(next: boolean) {
    setPersonalMode(next);
    if (next) {
      setTopic("");
    } else if (!topic) {
      setTopic(STORY_TOP_TOPICS[0]);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setLearnedFacts([]);
    setStorySchoolStage(null);

    if (personalMode && !personalAvailable) {
      setFieldError(
        "Für „Ganz persönlich“ brauchst du in Meine Welt einen Namen und mindestens ein Interesse oder einen Wunsch unter „Das möchte ich mal erleben“.",
      );
      toast.error(
        "Bitte ergänze zuerst deine Welt — oder wähl ein Top-Thema.",
      );
      return;
    }

    if (!personalMode && !topic) {
      setFieldError("Bitte wähl ein Thema oder schalte „Ganz persönlich“ ein.");
      toast.error("Bitte wähl ein Thema oder schalte „Ganz persönlich“ ein.");
      return;
    }

    setStatusText(
      personalMode
        ? "Ich hole spannendes Wissen aus deiner Welt …"
        : "Ich hole spannendes Wissen für dich …",
    );

    startTransition(async () => {
      const result = await generateFreeStoryAction({
        personalMode,
        topic: personalMode ? undefined : topic,
        schoolStage,
        lengthStep,
        mood,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success || !result.data) {
        setStatusText(null);
        setFieldError(result.error ?? "Deine Geschichte konnte nicht entstehen.");
        toast.error(result.error ?? "Deine Geschichte konnte nicht entstehen.");
        setSelectionExpanded(true);
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
      setSelectionExpanded(false);
    });
  }

  async function handleExportPdf() {
    if (!output || isExporting) return;
    setIsExporting(true);
    try {
      await openStoryPrintDialog({
        storyHtml: output,
        learnedFacts,
        bodyFontSizeRem: exportFontSizeForSchoolStage(
          storySchoolStage ?? schoolStage,
        ),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "PDF-Export konnte nicht gestartet werden.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  const storyTextClass = storyBodyClassName(storySchoolStage ?? schoolStage);
  const hasStory = Boolean(output) && !isPending;
  const selectionCollapsed = hasStory && !selectionExpanded;
  const summaryTopic = personalMode
    ? "Ganz persönlich"
    : topic || "Thema";
  const summaryStage =
    STORY_SCHOOL_STAGES.find((stage) => stage.id === schoolStage)?.label ??
    schoolStage;
  const summaryMood =
    STORY_MOODS.find((item) => item.id === mood)?.label ?? mood;

  return (
    <div className="grid items-start gap-8">
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

        {selectionCollapsed ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Deine Auswahl
              </p>
              <p className="mt-1 text-base font-bold text-zinc-950">
                {summaryTopic}
                <span className="font-semibold text-zinc-500">
                  {" "}
                  · {summaryStage} · {summaryMood}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectionExpanded(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-white"
            >
              Auswahl ändern
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            {hasStory ? (
              <div className="mb-6 flex items-center justify-between gap-3">
                <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                  Auswahl
                </p>
                <button
                  type="button"
                  onClick={() => setSelectionExpanded(false)}
                  className="text-sm font-bold text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
                >
                  Einklappen
                </button>
              </div>
            ) : null}

            <div>
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Thema
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Wähl eines der Top-Themen — oder mach’s ganz persönlich aus
                deiner Welt.
              </p>
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Thema"
              >
                {STORY_TOP_TOPICS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isPending}
                    onClick={() => selectTopic(item)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                      !personalMode && topic === item
                        ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                        : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-gray-100 px-4 py-3 ring-1 ring-zinc-950/10">
                <div>
                  <p className="text-sm font-extrabold text-zinc-950">
                    Ganz persönlich
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 sm:text-sm">
                    {personalAvailable
                      ? "Nutzt Name, Freunde und ein zufälliges Interesse oder Wunsch-Erlebnis aus Meine Welt."
                      : "Melde dich an und fülle in Meine Welt Name sowie Interesse oder „Das möchte ich mal erleben“."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={personalMode}
                  disabled={isPending || !personalAvailable}
                  onClick={() => togglePersonal(!personalMode)}
                  className={cn(
                    "relative h-8 w-14 shrink-0 rounded-full transition-all duration-200 ease-in-out",
                    personalMode ? "bg-orange-700" : "bg-zinc-300",
                    (!personalAvailable || isPending) && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-all duration-200 ease-in-out",
                      personalMode && "translate-x-6",
                    )}
                  />
                  <span className="sr-only">Ganz persönlich</span>
                </button>
              </div>
            </div>

            <fieldset className="mt-8" disabled={isPending}>
              <legend className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Schulstufe
              </legend>
              <p className="mt-1 text-sm text-zinc-600">
                So passen Sprache und Länge zu dem, was du schon gut lesen
                kannst.
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
                          active
                            ? "bg-yellow-400 text-zinc-950"
                            : "bg-white text-orange-700",
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
              <p className="mt-6 text-sm font-semibold text-orange-800">
                {fieldError}
              </p>
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
              {isPending
                ? "Deine Geschichte entsteht …"
                : hasStory
                  ? "Neue Geschichte starten"
                  : "Meine Geschichte starten"}
            </button>
          </>
        )}
      </form>

      {hasStory ? (
        <div className="grid gap-6">
          <section
            aria-label="Deine Geschichte"
            className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Deine Geschichte
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleExportPdf();
                }}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
              >
                {isExporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="size-4" aria-hidden />
                )}
                {isExporting ? "PDF wird vorbereitet …" : "Als PDF speichern"}
              </button>
            </div>
            <StoryHtmlBody content={output} className={storyTextClass} />
          </section>

          {learnedFacts.length > 0 ? (
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
                    className="flex gap-3 rounded-2xl bg-gray-100 px-4 py-3 text-lg leading-relaxed text-zinc-700 sm:text-xl"
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-extrabold text-white">
                      {index + 1}
                    </span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {portalReady && isPending
        ? createPortal(
            <div
              role="alertdialog"
              aria-modal="true"
              aria-busy="true"
              aria-labelledby="story-wait-title"
              aria-describedby="story-wait-desc"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
            >
              <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center shadow-2xl ring-1 ring-zinc-950/10">
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 ring-1 ring-orange-700/15">
                  <Loader2 className="size-7 animate-spin" aria-hidden />
                </span>
                <h2
                  id="story-wait-title"
                  className="mt-5 text-xl font-extrabold text-zinc-950"
                >
                  Deine Geschichte entsteht
                </h2>
                <p
                  id="story-wait-desc"
                  className="mt-2 text-sm font-semibold text-orange-900"
                >
                  {statusText ?? "Ich schreibe und male für dich …"}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  Zuerst hole ich Neues zum Staunen. Danach entstehen Geschichte
                  und Bilder parallel — zum Schluss fließt der Text um die
                  Bilder. Das kann einen Moment dauern.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function storyBodyClassName(stage: StorySchoolStageId): string {
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
