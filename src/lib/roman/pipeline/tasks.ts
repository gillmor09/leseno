/**
 * Resolve pipeline task_key → KI role (+ model via resolveRomanKiRolle).
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveRomanKiRolle,
  type RomanKiRolle,
} from "@/lib/roman/roles";
import type { AiModelConfig } from "@/lib/prompts/catalog";

export type PipelineTaskKind = "draft" | "critique" | "router" | "dialog";

export type RomanPipelineAufgabe = {
  taskKey: string;
  label: string;
  stage: string;
  kind: PipelineTaskKind;
  rolleKey: string;
  sortOrder: number;
  updatedAt: string | null;
};

type AufgabeRow = {
  task_key: string;
  label: string;
  stage: string;
  kind: string;
  rolle_key: string;
  sort_order: number;
  updated_at: string | null;
};

/** Fallback bindings when DB/RPC missing (matches migration seed). */
export const FALLBACK_PIPELINE_AUFGABEN: RomanPipelineAufgabe[] = [
  {
    taskKey: "idee.dialog",
    label: "Idee · Dialog",
    stage: "idee",
    kind: "dialog",
    rolleKey: "schreib_coach",
    sortOrder: 10,
    updatedAt: null,
  },
  {
    taskKey: "idee.draft",
    label: "Idee · Entwurf",
    stage: "idee",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 20,
    updatedAt: null,
  },
  {
    taskKey: "idee.critique",
    label: "Idee · Gegenlese",
    stage: "idee",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 30,
    updatedAt: null,
  },
  {
    taskKey: "charaktere.draft",
    label: "Charaktere · Entwurf",
    stage: "charaktere",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 40,
    updatedAt: null,
  },
  {
    taskKey: "charaktere.critique",
    label: "Charaktere · Gegenlese",
    stage: "charaktere",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 50,
    updatedAt: null,
  },
  {
    taskKey: "welt.draft",
    label: "Welt · Entwurf",
    stage: "welt",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 60,
    updatedAt: null,
  },
  {
    taskKey: "welt.critique",
    label: "Welt · Gegenlese",
    stage: "welt",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 70,
    updatedAt: null,
  },
  {
    taskKey: "expose.draft",
    label: "Exposé · Entwurf",
    stage: "expose",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 80,
    updatedAt: null,
  },
  {
    taskKey: "expose.critique",
    label: "Exposé · Gegenlese",
    stage: "expose",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 90,
    updatedAt: null,
  },
  {
    taskKey: "szenenplot.draft",
    label: "Szenenplot · Entwurf",
    stage: "szenenplot",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 100,
    updatedAt: null,
  },
  {
    taskKey: "szenenplot.critique",
    label: "Szenenplot · Gegenlese",
    stage: "szenenplot",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 110,
    updatedAt: null,
  },
  {
    taskKey: "manuskript.draft",
    label: "Manuskript · Entwurf",
    stage: "manuskript",
    kind: "draft",
    rolleKey: "co_autor",
    sortOrder: 120,
    updatedAt: null,
  },
  {
    taskKey: "manuskript.critique",
    label: "Manuskript · Gegenlese",
    stage: "manuskript",
    kind: "critique",
    rolleKey: "entwicklungslektor",
    sortOrder: 130,
    updatedAt: null,
  },
];

function rowToAufgabe(row: AufgabeRow): RomanPipelineAufgabe {
  const kind = row.kind as PipelineTaskKind;
  return {
    taskKey: row.task_key,
    label: row.label,
    stage: row.stage,
    kind:
      kind === "draft" ||
      kind === "critique" ||
      kind === "router" ||
      kind === "dialog"
        ? kind
        : "draft",
    rolleKey: row.rolle_key,
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: row.updated_at,
  };
}

function mergeFallback(
  rows: RomanPipelineAufgabe[],
): RomanPipelineAufgabe[] {
  const keys = new Set(rows.map((r) => r.taskKey));
  return [
    ...rows,
    ...FALLBACK_PIPELINE_AUFGABEN.filter((f) => !keys.has(f.taskKey)),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.taskKey.localeCompare(b.taskKey));
}

/** Load all pipeline task bindings. */
export async function loadPipelineAufgaben(options?: {
  mergeFallback?: boolean;
}): Promise<RomanPipelineAufgabe[]> {
  try {
    const supabase = createServiceClient(null);
    const { data, error } = await supabase.rpc("list_roman_pipeline_aufgaben");
    if (error) throw new Error(error.message);
    const rows = ((data as AufgabeRow[] | null) ?? []).map(rowToAufgabe);
    if (options?.mergeFallback !== false) return mergeFallback(rows);
    return rows;
  } catch {
    return [...FALLBACK_PIPELINE_AUFGABEN];
  }
}

/** Save one task binding (rolle must exist). */
export async function savePipelineAufgabe(
  aufgabe: Omit<RomanPipelineAufgabe, "updatedAt">,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("upsert_roman_pipeline_aufgabe", {
    p_task_key: aufgabe.taskKey,
    p_label: aufgabe.label.trim(),
    p_stage: aufgabe.stage.trim(),
    p_kind: aufgabe.kind,
    p_rolle_key: aufgabe.rolleKey.trim(),
    p_sort_order: aufgabe.sortOrder,
  });
  if (error) throw new Error(error.message);
}

/**
 * Resolve task → role + wired model.
 */
export async function resolvePipelineTask(taskKey: string): Promise<{
  aufgabe: RomanPipelineAufgabe;
  rolle: RomanKiRolle;
  model: AiModelConfig;
}> {
  const aufgaben = await loadPipelineAufgaben({ mergeFallback: true });
  const aufgabe =
    aufgaben.find((a) => a.taskKey === taskKey) ??
    FALLBACK_PIPELINE_AUFGABEN.find((a) => a.taskKey === taskKey);
  if (!aufgabe) {
    throw new Error(`Unbekannte Pipeline-Aufgabe „${taskKey}“.`);
  }
  const { rolle, model } = await resolveRomanKiRolle(aufgabe.rolleKey);
  return { aufgabe, rolle, model };
}

/** Human labels for task kinds in admin UI. */
export const PIPELINE_KIND_LABELS: Record<PipelineTaskKind, string> = {
  draft: "Entwurf",
  critique: "Gegenlese",
  router: "Router",
  dialog: "Dialog",
};

/**
 * Resolve display labels for draft + critique roles of one stage.
 */
export function stageRoleAssignment(
  aufgaben: RomanPipelineAufgabe[],
  rolleLabelByKey: Map<string, string>,
  stage: string,
): {
  draftLabel: string | null;
  critiqueLabel: string | null;
  draftRolleKey: string | null;
  critiqueRolleKey: string | null;
} {
  const draft = aufgaben.find((a) => a.stage === stage && a.kind === "draft");
  const critique = aufgaben.find(
    (a) => a.stage === stage && a.kind === "critique",
  );
  return {
    draftLabel: draft
      ? (rolleLabelByKey.get(draft.rolleKey) ?? draft.rolleKey)
      : null,
    critiqueLabel: critique
      ? (rolleLabelByKey.get(critique.rolleKey) ?? critique.rolleKey)
      : null,
    draftRolleKey: draft?.rolleKey ?? null,
    critiqueRolleKey: critique?.rolleKey ?? null,
  };
}

/**
 * Stages that have draft and/or critique tasks (for admin table grouping).
 */
export function groupAufgabenByStage(
  aufgaben: RomanPipelineAufgabe[],
): Array<{
  stage: string;
  draft: RomanPipelineAufgabe | null;
  critique: RomanPipelineAufgabe | null;
  other: RomanPipelineAufgabe[];
}> {
  const stageOrder = [
    "idee",
    "charaktere",
    "welt",
    "expose",
    "szenenplot",
    "manuskript",
    "pipeline",
  ];
  const byStage = new Map<string, RomanPipelineAufgabe[]>();
  for (const a of aufgaben) {
    const list = byStage.get(a.stage) ?? [];
    list.push(a);
    byStage.set(a.stage, list);
  }
  const stages = [
    ...stageOrder.filter((s) => byStage.has(s)),
    ...[...byStage.keys()].filter((s) => !stageOrder.includes(s)),
  ];
  return stages.map((stage) => {
    const list = byStage.get(stage) ?? [];
    return {
      stage,
      draft: list.find((a) => a.kind === "draft") ?? null,
      critique: list.find((a) => a.kind === "critique") ?? null,
      other: list.filter((a) => a.kind !== "draft" && a.kind !== "critique"),
    };
  });
}
