"use client";

/**
 * Edit pipeline task → role bindings, grouped by stage (Entwurf / Gegenlese).
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { saveRomanPipelineAufgabeAction } from "@/app/actions/roman-pipeline";
import {
  PIPELINE_KIND_LABELS,
  groupAufgabenByStage,
  type RomanPipelineAufgabe,
} from "@/lib/roman/pipeline/tasks";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import type { RomanKiRolle } from "@/lib/roman/roles";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";

function stageTitle(stage: string): string {
  if (stage in PIPELINE_STAGE_LABELS) {
    return PIPELINE_STAGE_LABELS[stage as PipelineStage];
  }
  if (stage === "pipeline") return "Pipeline (Router)";
  return stage;
}

export function RomanPipelineAufgabenPanel({
  initialAufgaben,
  rollen,
  canSave,
}: {
  initialAufgaben: RomanPipelineAufgabe[];
  rollen: RomanKiRolle[];
  canSave: boolean;
}) {
  const [aufgaben, setAufgaben] = useState(initialAufgaben);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const groups = useMemo(() => groupAufgabenByStage(aufgaben), [aufgaben]);

  function patchAufgabe(taskKey: string, rolleKey: string) {
    setAufgaben((current) =>
      current.map((row) =>
        row.taskKey === taskKey ? { ...row, rolleKey } : row,
      ),
    );
  }

  async function saveOne(aufgabe: RomanPipelineAufgabe) {
    if (!canSave || pendingKey) return;
    setPendingKey(aufgabe.taskKey);
    const result = await saveRomanPipelineAufgabeAction({
      taskKey: aufgabe.taskKey,
      label: aufgabe.label,
      stage: aufgabe.stage,
      kind: aufgabe.kind,
      rolleKey: aufgabe.rolleKey,
      sortOrder: aufgabe.sortOrder,
    });
    setPendingKey(null);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.aufgabe;
    setAufgaben((current) =>
      current.map((a) => (a.taskKey === saved.taskKey ? saved : a)),
    );
    toast.success(`${saved.label} gespeichert.`);
  }

  function RoleRow({
    aufgabe,
    kindLabel,
  }: {
    aufgabe: RomanPipelineAufgabe;
    kindLabel: string;
  }) {
    return (
      <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-end">
        <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          {kindLabel}
        </p>
        <label className="block min-w-0">
          <span className="sr-only">{kindLabel} Rolle</span>
          <select
            className={inputClass}
            value={aufgabe.rolleKey}
            disabled={!canSave || pendingKey === aufgabe.taskKey}
            onChange={(e) => patchAufgabe(aufgabe.taskKey, e.target.value)}
          >
            {rollen.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!canSave || pendingKey === aufgabe.taskKey}
          onClick={() => void saveOne(aufgabe)}
          className="rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pendingKey === aufgabe.taskKey ? "…" : "Speichern"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10">
      <div>
        <h2 className="text-lg font-extrabold text-zinc-950">
          Wer schreibt / wer gegenliest
        </h2>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Pro Pipeline-Schritt: Entwurf-Rolle und Gegenlese-Rolle. Speichern
          gilt sofort für alle Bücher.
        </p>
      </div>
      <ul className="space-y-4">
        {groups.map((g) => (
          <li
            key={g.stage}
            className="space-y-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/8"
          >
            <h3 className="text-sm font-extrabold text-zinc-950">
              {stageTitle(g.stage)}
            </h3>
            {g.draft ? (
              <RoleRow aufgabe={g.draft} kindLabel="Entwurf" />
            ) : null}
            {g.critique ? (
              <RoleRow aufgabe={g.critique} kindLabel="Gegenlese" />
            ) : null}
            {g.other.map((a) => (
              <RoleRow
                key={a.taskKey}
                aufgabe={a}
                kindLabel={PIPELINE_KIND_LABELS[a.kind]}
              />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
