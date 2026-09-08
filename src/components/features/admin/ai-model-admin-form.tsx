"use client";

/**
 * Admin editor for reusable AI model settings.
 * Prompt templates / social resolve these rows by id; the model slug picks a wired endpoint.
 * TTS roles also pick a provider voice (loaded from the TTS APIs where possible).
 */

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  listTtsVoicesAction,
  saveAiModelsAction,
} from "@/app/actions/prompt-admin";
import {
  WIRED_AI_ENDPOINTS,
  findWiredAiEndpoint,
  isTtsProvider,
} from "@/lib/ai/wired-models";
import type { TtsVoiceOption } from "@/lib/ai/tts-voices";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { cn } from "@/lib/utils";

function ensureTtsVoiceId(model: AiModelConfig): AiModelConfig {
  return {
    ...model,
    ttsVoiceId: model.ttsVoiceId ?? null,
  };
}

export function AiModelAdminForm({
  models: initialModels,
  canSave,
}: {
  models: AiModelConfig[];
  canSave: boolean;
}) {
  const [models, setModels] = useState(() =>
    initialModels.map(ensureTtsVoiceId),
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [voicesByProvider, setVoicesByProvider] = useState<
    Record<string, TtsVoiceOption[]>
  >({});
  const [voicesLoading, setVoicesLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [voicesError, setVoicesError] = useState<Record<string, string>>({});

  const ttsProviders = Array.from(
    new Set(
      models
        .map((model) => model.provider)
        .filter((provider) => isTtsProvider(provider)),
    ),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadVoices(provider: string) {
      setVoicesLoading((current) => ({ ...current, [provider]: true }));
      setVoicesError((current) => {
        const next = { ...current };
        delete next[provider];
        return next;
      });
      const result = await listTtsVoicesAction({ provider });
      if (cancelled) return;
      setVoicesLoading((current) => ({ ...current, [provider]: false }));
      if (!result.success || !result.data) {
        setVoicesError((current) => ({
          ...current,
          [provider]: result.error ?? "Stimmen konnten nicht geladen werden.",
        }));
        return;
      }
      setVoicesByProvider((current) => ({
        ...current,
        [provider]: result.data.voices,
      }));
    }

    for (const provider of ttsProviders) {
      if (voicesByProvider[provider] || voicesLoading[provider]) continue;
      void loadVoices(provider);
    }

    return () => {
      cancelled = true;
    };
    // Only re-run when the set of TTS providers on the form changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cache of loaded providers
  }, [ttsProviders.join("|")]);

  function patchModel(
    id: string,
    field: keyof AiModelConfig,
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
      current.map((model) => {
        if (model.id !== id) return model;
        const providerChanged = model.provider !== wired.provider;
        return {
          ...model,
          modelSlug: wired.modelSlug,
          provider: wired.provider,
          ttsVoiceId: providerChanged ? null : model.ttsVoiceId,
        };
      }),
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
        Was du speicherst, gilt zur Laufzeit. Pro Rolle wählst du ein
        angebundenes Modell; Provider und Kosten folgen daraus. Bei Vorlesen
        kannst du zusätzlich eine Stimme wählen.
      </p>

      {models.map((model) => {
        const wired = findWiredAiEndpoint(model.modelSlug);
        const selectValue = wired ? model.modelSlug : "";
        const showVoice = isTtsProvider(model.provider);
        const voices = voicesByProvider[model.provider] ?? [];
        const loadingVoices = Boolean(voicesLoading[model.provider]);
        const voiceLoadError = voicesError[model.provider];
        const selectedVoiceStillListed =
          !model.ttsVoiceId ||
          voices.some((voice) => voice.id === model.ttsVoiceId);

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
                Rolle: <span className="font-semibold">{model.id}</span>
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
                  {!wired ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Aktuelle Auswahl ist nicht angebunden — bitte neu wählen.
                    </span>
                  ) : null}
                </label>
              </div>

              {showVoice ? (
                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Stimme
                  </span>
                  <select
                    disabled={!canSave || loadingVoices}
                    value={model.ttsVoiceId ?? ""}
                    onChange={(event) =>
                      patchModel(
                        model.id,
                        "ttsVoiceId",
                        event.target.value || null,
                      )
                    }
                    className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                  >
                    <option value="">
                      {loadingVoices
                        ? "Stimmen werden geladen …"
                        : "Standard (Env / Provider-Default)"}
                    </option>
                    {!selectedVoiceStillListed && model.ttsVoiceId ? (
                      <option value={model.ttsVoiceId}>
                        Aktuell gespeichert: {model.ttsVoiceId}
                      </option>
                    ) : null}
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.description
                          ? `${voice.label} — ${voice.description}`
                          : voice.label}
                      </option>
                    ))}
                  </select>
                  {voiceLoadError ? (
                    <span className="mt-1 block text-xs text-orange-800">
                      {voiceLoadError}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Deutsch bevorzugt, sofern die API das filtert.
                    </span>
                  )}
                </label>
              ) : null}

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
