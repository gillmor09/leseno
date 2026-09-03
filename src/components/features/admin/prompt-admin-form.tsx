"use client";

/**
 * Admin editor for prompt templates in the two-step story pipeline.
 * Model management lives on its own page; this form only references model ids.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { savePromptTemplatesAction } from "@/app/actions/prompt-admin";
import type { AiModelConfig, PromptTemplateConfig } from "@/lib/prompts/catalog";
import { cn } from "@/lib/utils";

function csvFromPlaceholders(placeholders: string[]) {
  return placeholders.join(", ");
}

function placeholdersFromCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PromptAdminForm({
  prompts: initialPrompts,
  models,
  canSave,
}: {
  prompts: PromptTemplateConfig[];
  models: AiModelConfig[];
  canSave: boolean;
}) {
  const [prompts, setPrompts] = useState(() =>
    initialPrompts.map((prompt) => ({
      ...prompt,
      placeholdersCsv: csvFromPlaceholders(prompt.placeholders),
    })),
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patchPrompt(
    id: string,
    field: keyof (typeof prompts)[number],
    value: string | null,
  ) {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.id === id ? { ...prompt, [field]: value } : prompt,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar, bis die Prompt-Migration ausgeführt ist.",
      );
      return;
    }

    setFieldError(null);
    setPending(true);

    const result = await savePromptTemplatesAction({
      prompts: prompts.map(({ placeholdersCsv, ...prompt }) => ({
        ...prompt,
        placeholders: placeholdersFromCsv(placeholdersCsv),
      })),
    });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("Prompts gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          Vorschau: Die Prompt-Daten konnten evtl. nicht geladen werden. Bitte
          die Migration `prompt_admin` ausführen.
        </p>
      ) : null}

      <section className="space-y-6">
        {prompts.map((prompt) => (
          <article
            key={prompt.id}
            className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
          >
            <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
              <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
                Stufe {prompt.stageOrder}
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-zinc-950">
                {prompt.label}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">{prompt.purpose}</p>
            </div>
            <div className="grid gap-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Name
                  </span>
                  <input
                    type="text"
                    disabled={!canSave}
                    value={prompt.label}
                    onChange={(event) =>
                      patchPrompt(prompt.id, "label", event.target.value)
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Modell
                  </span>
                  <select
                    disabled={!canSave}
                    value={prompt.modelId ?? ""}
                    onChange={(event) =>
                      patchPrompt(
                        prompt.id,
                        "modelId",
                        event.target.value || null,
                      )
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  >
                    <option value="">Kein Modell</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Zweck
                </span>
                <input
                  type="text"
                  disabled={!canSave}
                  value={prompt.purpose}
                  onChange={(event) =>
                    patchPrompt(prompt.id, "purpose", event.target.value)
                  }
                  className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Platzhalter
                </span>
                <input
                  type="text"
                  disabled={!canSave}
                  value={prompt.placeholdersCsv}
                  onChange={(event) =>
                    patchPrompt(
                      prompt.id,
                      "placeholdersCsv",
                      event.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  System-Prompt
                </span>
                <textarea
                  rows={5}
                  disabled={!canSave}
                  value={prompt.systemTemplate}
                  onChange={(event) =>
                    patchPrompt(prompt.id, "systemTemplate", event.target.value)
                  }
                  className="mt-1 w-full rounded-[1.25rem] bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  User-Prompt
                </span>
                <textarea
                  rows={8}
                  disabled={!canSave}
                  value={prompt.userTemplate}
                  onChange={(event) =>
                    patchPrompt(prompt.id, "userTemplate", event.target.value)
                  }
                  className="mt-1 w-full rounded-[1.25rem] bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Aufbau-Notizen
                  </span>
                  <textarea
                    rows={4}
                    disabled={!canSave}
                    value={prompt.assemblyNotes ?? ""}
                    onChange={(event) =>
                      patchPrompt(
                        prompt.id,
                        "assemblyNotes",
                        event.target.value || null,
                      )
                    }
                    className="mt-1 w-full rounded-[1.25rem] bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Ausgabe-Vertrag
                  </span>
                  <textarea
                    rows={4}
                    disabled={!canSave}
                    value={prompt.outputContract ?? ""}
                    onChange={(event) =>
                      patchPrompt(
                        prompt.id,
                        "outputContract",
                        event.target.value || null,
                      )
                    }
                    className="mt-1 w-full rounded-[1.25rem] bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  />
                </label>
              </div>
            </div>
          </article>
        ))}
      </section>

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
