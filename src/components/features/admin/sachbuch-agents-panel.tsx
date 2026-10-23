"use client";

/**
 * Per-book agent matrix: system prompts (+ Google Search where allowed).
 * Models are hard-wired at runtime — UI shows the effective slug, not stale
 * values from `agents.*.modelSlug`.
 */

import { useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import {
  SACHBUCH_RUNTIME_MODEL_BY_AGENT,
} from "@/lib/sachbuch/agent-defaults";
import type {
  SachbuchAgentKey,
  SachbuchAgents,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { sachbuchModelLabel } from "@/lib/sachbuch/wait-presets";
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
  canSave,
  onSaved,
}: {
  book: SachbuchKontext;
  /** @deprecated Models are hard-wired; kept optional for call-site compat. */
  modelOptions?: Array<{ modelSlug: string; label: string }>;
  canSave: boolean;
  onSaved: (book: SachbuchKontext) => void;
}) {
  const [agents, setAgents] = useState<SachbuchAgents>(() => {
    // Keep prompts/flags from book; sync modelSlug to runtime for saves.
    const next = { ...book.agents };
    for (const key of Object.keys(SACHBUCH_RUNTIME_MODEL_BY_AGENT) as SachbuchAgentKey[]) {
      next[key] = {
        ...next[key],
        modelSlug: SACHBUCH_RUNTIME_MODEL_BY_AGENT[key],
      };
    }
    return next;
  });
  const [pending, setPending] = useState(false);

  function patchSlot(
    key: SachbuchAgentKey,
    patch: Partial<SachbuchAgents[SachbuchAgentKey]>,
  ) {
    setAgents((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
        // Never let UI overwrite the hard-wired runtime model.
        modelSlug: SACHBUCH_RUNTIME_MODEL_BY_AGENT[key],
      },
    }));
  }

  async function handleSave() {
    if (!canSave || pending) return;
    setPending(true);
    const synced: SachbuchAgents = { ...agents };
    for (const key of Object.keys(SACHBUCH_RUNTIME_MODEL_BY_AGENT) as SachbuchAgentKey[]) {
      synced[key] = {
        ...synced[key],
        modelSlug: SACHBUCH_RUNTIME_MODEL_BY_AGENT[key],
      };
    }
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: synced,
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
        Modelle sind fest verdrahtet (Anzeige = Laufzeit). System-Prompts und
        Google-Search gelten pro Buch — unabhängig von Roman / Clever.
      </p>
      <div className="space-y-4">
        {ROLE_META.map((role) => {
          const slot = agents[role.key];
          const runtimeSlug = SACHBUCH_RUNTIME_MODEL_BY_AGENT[role.key];
          return (
            <section
              key={role.key}
              className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6"
            >
              <h3 className="text-base font-extrabold text-zinc-950">
                {role.label}
              </h3>
              <div>
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Modell (Laufzeit)
                </span>
                <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-950 ring-1 ring-zinc-950/10">
                  {sachbuchModelLabel(runtimeSlug)}
                  <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                    {runtimeSlug}
                  </span>
                </p>
              </div>
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
