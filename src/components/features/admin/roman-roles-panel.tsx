"use client";

/**
 * Editor for Roman-module KI roles: system prompt + wired text model + reasoning.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { saveRomanKiRolleAction } from "@/app/actions/roman-roles-admin";
import {
  REASONING_EFFORT_AUTO,
  modelSupportsReasoningEffort,
  reasoningEffortOptionsForModel,
  reasoningEffortUiLabel,
} from "@/lib/ai/reasoning-effort";
import type { RomanKiRolle } from "@/lib/roman/roles";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";
const textareaClass = `${inputClass} font-sans`;

type ModelOption = { modelSlug: string; label: string };

export function RomanRolesPanel({
  initialRollen,
  modelOptions,
  canSave,
}: {
  initialRollen: RomanKiRolle[];
  modelOptions: ModelOption[];
  canSave: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...initialRollen].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
      ),
    [initialRollen],
  );
  const [rollen, setRollen] = useState(sorted);
  const [selectedKey, setSelectedKey] = useState(sorted[0]?.key ?? "");
  const [pending, setPending] = useState(false);

  const selected = rollen.find((r) => r.key === selectedKey) ?? rollen[0];
  const effortOptions = selected
    ? reasoningEffortOptionsForModel(selected.modelSlug)
    : [];
  const supportsEffort = selected
    ? modelSupportsReasoningEffort(selected.modelSlug)
    : false;

  function patchSelected(patch: Partial<RomanKiRolle>) {
    if (!selected) return;
    setRollen((current) =>
      current.map((r) => {
        if (r.key !== selected.key) return r;
        const next = { ...r, ...patch };
        if (patch.modelSlug && patch.modelSlug !== r.modelSlug) {
          const opts = reasoningEffortOptionsForModel(patch.modelSlug);
          if (opts.length === 0) {
            next.reasoningEffort = REASONING_EFFORT_AUTO;
          } else if (
            next.reasoningEffort &&
            !opts.some((o) => o.value === next.reasoningEffort)
          ) {
            next.reasoningEffort = REASONING_EFFORT_AUTO;
          }
        }
        return next;
      }),
    );
  }

  async function handleSave() {
    if (!selected || !canSave || pending) return;
    setPending(true);
    const result = await saveRomanKiRolleAction({
      key: selected.key,
      label: selected.label,
      purpose: selected.purpose,
      systemPrompt: selected.systemPrompt,
      userPromptHint: selected.userPromptHint,
      modelSlug: selected.modelSlug,
      reasoningEffort: selected.reasoningEffort ?? "",
      sortOrder: selected.sortOrder,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.rolle;
    setRollen((current) =>
      current.map((r) => (r.key === saved.key ? saved : r)),
    );
    toast.success(`${saved.label} gespeichert.`);
  }

  if (!selected) {
    return (
      <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-950/8">
        Noch keine KI-Rollen. Migration{" "}
        <code className="font-mono text-xs">roman_ki_rollen</code> ausführen.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        aria-label="KI-Rollen"
        className="space-y-1 rounded-3xl bg-white p-3 ring-1 ring-zinc-950/10"
      >
        {rollen.map((rolle) => {
          const active = rolle.key === selected.key;
          return (
            <button
              key={rolle.key}
              type="button"
              onClick={() => setSelectedKey(rolle.key)}
              className={cn(
                "w-full rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition",
                active
                  ? "bg-orange-50 text-orange-950 ring-1 ring-orange-200"
                  : "text-zinc-700 hover:bg-zinc-50",
              )}
            >
              {rolle.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
            Key
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-zinc-800">
            {selected.key}
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Label
          </span>
          <input
            value={selected.label}
            onChange={(e) => patchSelected({ label: e.target.value })}
            disabled={!canSave || pending}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Zweck
          </span>
          <textarea
            value={selected.purpose}
            onChange={(e) => patchSelected({ purpose: e.target.value })}
            disabled={!canSave || pending}
            rows={2}
            className={textareaClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Modell
          </span>
          <select
            value={selected.modelSlug}
            onChange={(e) => patchSelected({ modelSlug: e.target.value })}
            disabled={!canSave || pending}
            className={inputClass}
          >
            {modelOptions.map((m) => (
              <option key={m.modelSlug} value={m.modelSlug}>
                {m.label}
              </option>
            ))}
            {!modelOptions.some((m) => m.modelSlug === selected.modelSlug) ? (
              <option value={selected.modelSlug}>{selected.modelSlug}</option>
            ) : null}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            {reasoningEffortUiLabel(selected.modelSlug)}
          </span>
          {supportsEffort ? (
            <>
              <select
                value={selected.reasoningEffort || REASONING_EFFORT_AUTO}
                onChange={(e) =>
                  patchSelected({ reasoningEffort: e.target.value })
                }
                disabled={!canSave || pending}
                className={inputClass}
              >
                <option value={REASONING_EFFORT_AUTO}>
                  Automatisch (Modell-Default)
                </option>
                {effortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs font-semibold text-zinc-500">
                Wie gründlich das Modell vor der Antwort nachdenkt. Gemini:
                thinking_level (low/medium/high). OpenAI: reasoning_effort.
                Marktanalyse: high empfohlen.
              </p>
            </>
          ) : (
            <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-950/8">
              Dieses Modell hat keinen Reasoning-/Thinking-Parameter (z. B.
              Claude). OpenAI und Gemini werden über dasselbe Rollen-Feld
              gesteuert.
            </p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            System-Prompt
          </span>
          <textarea
            value={selected.systemPrompt}
            onChange={(e) => patchSelected({ systemPrompt: e.target.value })}
            disabled={!canSave || pending}
            rows={14}
            className={textareaClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            User-Prompt-Hinweis (optional)
          </span>
          <textarea
            value={selected.userPromptHint}
            onChange={(e) => patchSelected({ userPromptHint: e.target.value })}
            disabled={!canSave || pending}
            rows={3}
            className={textareaClass}
            placeholder="Was der User-Prompt typischerweise enthalten soll"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void handleSave()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {pending ? "Speichern …" : "Speichern"}
          </button>
          {!canSave ? (
            <p className="text-xs font-semibold text-amber-800">
              Speichern braucht Service-Role.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
