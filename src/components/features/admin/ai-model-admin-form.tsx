"use client";

/**
 * Admin editor for reusable AI model settings.
 * Prompt templates reference these model records by id.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveAiModelsAction } from "@/app/actions/prompt-admin";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { cn } from "@/lib/utils";

const PROVIDER_OPTIONS = [
  { id: "openai", label: "openai" },
  { id: "openai-compatible", label: "openai-compatible" },
  { id: "gemini", label: "gemini" },
  { id: "claude", label: "claude" },
] as const;

export function AiModelAdminForm({
  models: initialModels,
  canSave,
}: {
  models: AiModelConfig[];
  canSave: boolean;
}) {
  const [models, setModels] = useState(initialModels);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patchModel(
    id: string,
    field: keyof (typeof models)[number],
    value: string | boolean | null,
  ) {
    setModels((current) =>
      current.map((model) =>
        model.id === id ? { ...model, [field]: value } : model,
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

    const result = await saveAiModelsAction({ models });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("KI-Modelle gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          Vorschau: Die Modell-Daten konnten evtl. nicht geladen werden. Bitte
          die Migration `prompt_admin` ausführen.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
        <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
          <h2 className="text-lg font-extrabold text-zinc-950">KI-Modelle</h2>
          <p className="text-sm text-zinc-600">
            Provider „openai-compatible“ nutzt den IONOS AI Model Hub
            (`IONOS_API_TOKEN`, Modell z. B. `openai/gpt-oss-120b`).
          </p>
        </div>
        <div className="divide-y divide-zinc-950/5">
          {models.map((model) => (
            <div key={model.id} className="grid gap-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Name
                  </span>
                  <input
                    type="text"
                    disabled={!canSave}
                    value={model.label}
                    onChange={(event) =>
                      patchModel(model.id, "label", event.target.value)
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Provider
                  </span>
                  <select
                    disabled={!canSave}
                    value={model.provider}
                    onChange={(event) =>
                      patchModel(model.id, "provider", event.target.value)
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Model-Slug
                </span>
                <input
                  type="text"
                  disabled={!canSave}
                  value={model.modelSlug}
                  onChange={(event) =>
                    patchModel(model.id, "modelSlug", event.target.value)
                  }
                  className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Notizen
                </span>
                <textarea
                  rows={2}
                  disabled={!canSave}
                  value={model.notes ?? ""}
                  onChange={(event) =>
                    patchModel(model.id, "notes", event.target.value || null)
                  }
                  className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>
              <div className="flex flex-wrap gap-3 text-sm text-zinc-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!canSave}
                    checked={model.supportsSystemPrompt}
                    onChange={(event) =>
                      patchModel(
                        model.id,
                        "supportsSystemPrompt",
                        event.target.checked,
                      )
                    }
                  />
                  System-Prompt
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!canSave}
                    checked={model.supportsJsonOutput}
                    onChange={(event) =>
                      patchModel(
                        model.id,
                        "supportsJsonOutput",
                        event.target.checked,
                      )
                    }
                  />
                  JSON-Ausgabe
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!canSave}
                    checked={model.isActive}
                    onChange={(event) =>
                      patchModel(model.id, "isActive", event.target.checked)
                    }
                  />
                  Aktiv
                </label>
              </div>
            </div>
          ))}
        </div>
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
