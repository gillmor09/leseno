"use client";

/**
 * Per-book agent matrix: model, Google Search (writer), system prompts.
 */

import { useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import type { SachbuchAgentKey, SachbuchAgents, SachbuchKontext } from "@/lib/sachbuch/types";
import { cn } from "@/lib/utils";

const ROLE_META: Array<{
  key: SachbuchAgentKey;
  label: string;
  allowSearch: boolean;
}> = [
  { key: "interviewer", label: "Sokratischer Interviewer", allowSearch: false },
  { key: "researcher", label: "Researcher (Evidenz)", allowSearch: true },
  { key: "architect", label: "Architect (Makro / Graph)", allowSearch: false },
  { key: "writer", label: "Writer (Abschnitte)", allowSearch: true },
  { key: "critic", label: "Devil's Advocate / Critic", allowSearch: false },
  { key: "stylist", label: "Style Matcher", allowSearch: false },
];

export function SachbuchAgentsPanel({
  book,
  modelOptions,
  canSave,
  onSaved,
}: {
  book: SachbuchKontext;
  modelOptions: Array<{ modelSlug: string; label: string }>;
  canSave: boolean;
  onSaved: (book: SachbuchKontext) => void;
}) {
  const [agents, setAgents] = useState<SachbuchAgents>(book.agents);
  const [pending, setPending] = useState(false);

  function patchSlot(
    key: SachbuchAgentKey,
    patch: Partial<SachbuchAgents[SachbuchAgentKey]>,
  ) {
    setAgents((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  async function handleSave() {
    if (!canSave || pending) return;
    setPending(true);
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: book.kapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onSaved(result.data!.book);
    toast.success("Agenten gespeichert.");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-zinc-600">
        Modelle und System-Prompts gelten nur für dieses Buch — unabhängig von
        Roman / Clever.
      </p>
      <div className="space-y-4">
        {ROLE_META.map((role) => {
          const slot = agents[role.key];
          return (
            <section
              key={role.key}
              className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6"
            >
              <h3 className="text-base font-extrabold text-zinc-950">
                {role.label}
              </h3>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Modell
                </span>
                <select
                  value={slot.modelSlug}
                  disabled={!canSave || pending}
                  onChange={(e) =>
                    patchSlot(role.key, { modelSlug: e.target.value })
                  }
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
                >
                  {!modelOptions.some((m) => m.modelSlug === slot.modelSlug) ? (
                    <option value={slot.modelSlug}>{slot.modelSlug}</option>
                  ) : null}
                  {modelOptions.map((m) => (
                    <option key={m.modelSlug} value={m.modelSlug}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {role.allowSearch ? (
                <label className="flex items-center gap-3 text-sm font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={slot.googleSearch}
                    disabled={!canSave || pending}
                    onChange={(e) =>
                      patchSlot(role.key, { googleSearch: e.target.checked })
                    }
                    className="size-4 rounded border-zinc-300 text-orange-700 focus:ring-orange-700"
                  />
                  Google Search Grounding (nur Gemini)
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  System-Prompt
                </span>
                <textarea
                  value={slot.systemPrompt}
                  disabled={!canSave || pending}
                  onChange={(e) =>
                    patchSlot(role.key, { systemPrompt: e.target.value })
                  }
                  rows={8}
                  className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
              </label>
            </section>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!canSave || pending}
        onClick={() => void handleSave()}
        className={cn(
          "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
        )}
      >
        {pending ? "Speichern …" : "Agenten speichern"}
      </button>
    </div>
  );
}
