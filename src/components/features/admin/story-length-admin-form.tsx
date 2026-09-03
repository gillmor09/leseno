"use client";

/**
 * Admin editor for `leseno.story_length_limits`.
 * Empty max = unbounded ("über X Wörter"). Auth on this route comes later.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveStoryLengthLimitsAction } from "@/app/actions/story-length";
import { AGE_GROUP_IDS, type StoryLengthCatalog } from "@/lib/stories/length";
import { cn } from "@/lib/utils";

const AGE_GROUP_COPY: Record<(typeof AGE_GROUP_IDS)[number], string> = {
  "5-7": "5–7 Jahre",
  "8-10": "8–10 Jahre",
};

export function StoryLengthAdminForm({ catalog }: { catalog: StoryLengthCatalog }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      catalog.limits.map((limit) => [
        limit.id,
        {
          minWords: String(limit.minWords),
          maxWords: limit.maxWords === null ? "" : String(limit.maxWords),
        },
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patch(id: string, field: "minWords" | "maxWords", value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setPending(true);

    const result = await saveStoryLengthLimitsAction({
      limits: catalog.limits.map((limit) => ({
        id: limit.id,
        minWords: drafts[limit.id]?.minWords ?? "",
        maxWords: drafts[limit.id]?.maxWords ?? "",
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
              Wortspannen für die fünf Reglerstufen. Höchstwert leer = „über …“.
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
                  <p className="text-sm font-extrabold text-zinc-950">{step.label}</p>
                  <label className="block">
                    <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      Von (Wörter)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`min-${limit.id}`}
                      value={draft?.minWords ?? ""}
                      onChange={(event) => patch(limit.id, "minWords", event.target.value)}
                      className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      Bis (leer = über)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`max-${limit.id}`}
                      value={draft?.maxWords ?? ""}
                      onChange={(event) => patch(limit.id, "maxWords", event.target.value)}
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
        disabled={pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          pending && "opacity-70",
        )}
      >
        {pending ? "Speichert …" : "Speichern"}
      </button>
    </form>
  );
}
