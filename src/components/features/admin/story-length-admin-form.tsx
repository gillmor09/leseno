"use client";

/**
 * Admin editor for `leseno.story_length_limits` (target word count + fact count).
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveStoryLengthLimitsAction } from "@/app/actions/story-length";
import { AGE_GROUP_IDS, type StoryLengthCatalog } from "@/lib/stories/length";
import { cn } from "@/lib/utils";

const AGE_GROUP_COPY: Record<(typeof AGE_GROUP_IDS)[number], string> = {
  "5-7": "Vorschule bis 2. Klasse",
  "8-10": "3. Klasse bis Höher",
};

export function StoryLengthAdminForm({
  catalog,
  canSave,
  readOnlyNotice,
}: {
  catalog: StoryLengthCatalog;
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      catalog.limits.map((limit) => [
        limit.id,
        {
          anzahlWoerter: String(limit.anzahlWoerter),
          factCount: String(limit.factCount),
        },
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patch(
    id: string,
    field: "anzahlWoerter" | "factCount",
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar, bis die Migration `story_length_limits` ausgeführt ist.",
      );
      return;
    }
    setFieldError(null);
    setPending(true);

    const result = await saveStoryLengthLimitsAction({
      limits: catalog.limits.map((limit) => ({
        id: limit.id,
        anzahlWoerter: drafts[limit.id]?.anzahlWoerter ?? "",
        factCount: drafts[limit.id]?.factCount ?? "",
      })),
    });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("Textlängen gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {readOnlyNotice ??
            "Vorschau: Die Textlängen konnten evtl. nicht geladen werden. Bitte die Migration `story_length_limits` ausführen."}
        </p>
      ) : null}
      {AGE_GROUP_IDS.map((groupId) => (
        <section
          key={groupId}
          className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
        >
          <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
            <h2 className="text-lg font-extrabold text-zinc-950">
              {AGE_GROUP_COPY[groupId]}
            </h2>
            <p className="text-sm text-zinc-600">
              Ziel-Wortanzahl und Faktenanzahl für die fünf Reglerstufen. Die
              Geschichte soll in etwa diese Wortzahl erreichen.
            </p>
          </div>
          <div className="divide-y divide-zinc-950/5">
            {catalog.steps.map((step) => {
              const limit = catalog.limits.find(
                (row) => row.ageGroupId === groupId && row.stepId === step.id,
              );
              if (!limit) {
                return null;
              }
              const draft = drafts[limit.id];
              return (
                <div
                  key={limit.id}
                  className="grid gap-4 px-6 py-4 sm:grid-cols-[8rem_1fr_1fr] sm:items-end"
                >
                  <p className="text-sm font-extrabold text-zinc-950">
                    {step.label}
                  </p>
                  <label className="block">
                    <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      anzahl_wörter
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`words-${limit.id}`}
                      value={draft?.anzahlWoerter ?? ""}
                      disabled={!canSave}
                      onChange={(event) =>
                        patch(limit.id, "anzahlWoerter", event.target.value)
                      }
                      className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      Fakten
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`facts-${limit.id}`}
                      value={draft?.factCount ?? ""}
                      disabled={!canSave}
                      onChange={(event) =>
                        patch(limit.id, "factCount", event.target.value)
                      }
                      className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {fieldError ? (
        <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSave || pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          (!canSave || pending) && "opacity-70",
        )}
      >
        {pending ? "Speichert …" : canSave ? "Speichern" : "Migration ausführen"}
      </button>
    </form>
  );
}
