"use client";

/**
 * Admin editor for reusable AI model settings.
 * Prompt templates / social resolve these rows by id; the model slug picks a wired endpoint.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveAiModelsAction } from "@/app/actions/prompt-admin";
import {
  WIRED_AI_ENDPOINTS,
  findWiredAiEndpoint,
} from "@/lib/ai/wired-models";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { cn } from "@/lib/utils";

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

  function setModelEndpoint(id: string, modelSlug: string) {
    const wired = findWiredAiEndpoint(modelSlug);
    if (!wired) return;
    setModels((current) =>
      current.map((model) =>
        model.id === id
          ? { ...model, modelSlug: wired.modelSlug, provider: wired.provider }
          : model,
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

      <p className="text-sm text-zinc-600">
        Was du hier speicherst, ist aktiv zur Laufzeit (Kosten &amp; Routing).
        Die Auswahl enthält nur angebundene Endpunkte; der Provider wird
        automatisch gesetzt.
      </p>

      {models.map((model) => {
        const wired = findWiredAiEndpoint(model.modelSlug);
        const selectValue = wired ? model.modelSlug : "";
        return (
          <section
            key={model.id}
            className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
          >
            <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
              <h2 className="text-lg font-extrabold text-zinc-950">
                {model.label || model.id}
              </h2>
              <p className="text-sm text-zinc-600">
                Interne ID: <span className="font-semibold">{model.id}</span>
                {wired ? (
                  <>
                    {" "}
                    · Provider:{" "}
                    <span className="font-semibold">{wired.provider}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5">
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
                    Modell
                  </span>
                  <select
                    disabled={!canSave}
                    value={selectValue}
                    onChange={(event) =>
                      setModelEndpoint(model.id, event.target.value)
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  >
                    {!wired ? (
                      <option value="" disabled>
                        Unbekannt: {model.modelSlug} — bitte wählen
                      </option>
                    ) : null}
                    {WIRED_AI_ENDPOINTS.map((endpoint) => (
                      <option
                        key={endpoint.modelSlug}
                        value={endpoint.modelSlug}
                      >
                        {endpoint.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {wired
                      ? wired.usage
                      : "Aktueller Slug ist nicht angebunden — Auswahl speichern."}
                  </span>
                </label>
              </div>
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
          </section>
        );
      })}

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
