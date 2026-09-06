"use client";

/**
 * Admin editor for per-school-stage Lesemodus / story-card typography defaults.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveReadingTypographyDefaultsAction } from "@/app/actions/reading-typography-admin";
import { ReadingModePrefsControls } from "@/components/features/stories/reading-mode-prefs-controls";
import {
  normalizeReadingModePrefs,
  type ReadingModePrefs,
} from "@/lib/stories/reading-mode-prefs";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import { cn } from "@/lib/utils";

export function ReadingTypographyAdminForm({
  catalog,
  canSave,
  readOnlyNotice,
}: {
  catalog: ReadingTypographyDefaultsCatalog;
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [drafts, setDrafts] = useState<ReadingTypographyDefaultsCatalog>(() =>
    Object.fromEntries(
      STORY_SCHOOL_STAGES.map((stage) => [
        stage.id,
        normalizeReadingModePrefs(catalog[stage.id]),
      ]),
    ) as ReadingTypographyDefaultsCatalog,
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patchStage(stageId: keyof ReadingTypographyDefaultsCatalog, next: ReadingModePrefs) {
    setDrafts((current) => ({
      ...current,
      [stageId]: normalizeReadingModePrefs(next),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar — bitte Migration und Service-Role prüfen.",
      );
      return;
    }
    setFieldError(null);
    setPending(true);

    const result = await saveReadingTypographyDefaultsAction({
      defaults: STORY_SCHOOL_STAGES.map((stage) => ({
        schoolStage: stage.id,
        prefs: drafts[stage.id],
      })),
    });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("Schrifteinstellungen gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {readOnlyNotice ??
            "Vorschau: Schrifteinstellungen konnten nicht geladen werden."}
        </p>
      ) : null}

      {STORY_SCHOOL_STAGES.map((stage) => (
        <section
          key={stage.id}
          className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
        >
          <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
            <h2 className="text-lg font-extrabold text-zinc-950">
              {stage.label}
            </h2>
            <p className="text-sm text-zinc-600">
              Startwerte für Geschichten-Card und Lesemodus (Standard).
            </p>
          </div>
          <div className="px-6 py-4">
            <ReadingModePrefsControls
              prefs={drafts[stage.id]}
              onChange={(next) => patchStage(stage.id, next)}
            />
          </div>
        </section>
      ))}

      {fieldError ? (
        <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !canSave}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          (pending || !canSave) && "opacity-70",
        )}
      >
        {pending ? "Speichern …" : "Speichern"}
      </button>
    </form>
  );
}
