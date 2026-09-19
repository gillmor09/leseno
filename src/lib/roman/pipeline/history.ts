/**
 * Persist / load vertical pipeline run history.
 */

import type { AiTokenUsage } from "@/lib/ai/usage-types";
import { formatUsageLine } from "@/lib/ai/usage-types";
import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";

export { formatUsageLine };
export type { AiTokenUsage };

export type PipelineHistoryTrigger =
  | "auto_generate"
  | "manual_critique"
  | "manual_critique_only"
  | "cascade_regen"
  | "dimension_improve"
  | "dimension_analyze"
  | "dimension_apply"
  | "reifegrad_assess"
  | "leser_feedback"
  | "leser_feedback_apply"
  | "manuskript_vereinfachen"
  | "manuskript_original_restore"
  | "stage_verbessern_analyze"
  | "stage_verbessern_apply"
  | "canon_logic_plan"
  | "canon_logic_apply"
  | "manuskript_chapter";

export type PipelineHistoryEvent = {
  at: string;
  type: "draft" | "critique" | "route" | "apply" | "regen" | "error" | "info";
  stage?: PipelineStage | string;
  roleKey?: string;
  modelLabel?: string;
  summary: string;
  detail?: string;
  targets?: Array<{ stage: string; reason: string }>;
  /** Aggregated token usage for this step (all provider calls). */
  usage?: AiTokenUsage;
  /** Structured critique (critique steps) — kept server-side to avoid fat client round-trips. */
  critique?: import("@/lib/roman/pipeline/critique-schema").CritiquePayload;
  critiqueText?: string;
};

export type PipelineHistoryRun = {
  id: string;
  romanId: string;
  createdAt: string;
  trigger: string;
  originStage: string;
  status: "running" | "ok" | "error" | string;
  events: PipelineHistoryEvent[];
};

type HistoryRow = {
  id: string;
  roman_id: string;
  created_at: string;
  trigger: string;
  origin_stage: string;
  status: string;
  events: unknown;
};

function asEvents(value: unknown): PipelineHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e) =>
      e &&
      typeof e === "object" &&
      typeof (e as { summary?: unknown }).summary === "string",
  ) as PipelineHistoryEvent[];
}

function rowToRun(row: HistoryRow): PipelineHistoryRun {
  return {
    id: row.id,
    romanId: row.roman_id,
    createdAt: row.created_at,
    trigger: row.trigger,
    originStage: row.origin_stage,
    status: row.status,
    events: asEvents(row.events),
  };
}

export async function listPipelineHistory(
  romanId: string,
  limit = 40,
): Promise<PipelineHistoryRun[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_list_roman_pipeline_history",
    {
      p_roman_id: romanId,
      p_limit: limit,
    },
  );
  if (error) throw new Error(error.message);
  return ((data as HistoryRow[] | null) ?? []).map(rowToRun);
}

/**
 * Load one history run (via recent list filter — no dedicated get RPC).
 * Used for live progress polling during long Manuskript drafts.
 */
export async function getPipelineHistoryRun(
  romanId: string,
  runId: string,
): Promise<PipelineHistoryRun | null> {
  const runs = await listPipelineHistory(romanId, 20);
  return runs.find((r) => r.id === runId) ?? null;
}

/** Latest live-progress summary for a running pipeline step, if any. */
export function latestLiveProgressLabel(
  run: PipelineHistoryRun | null | undefined,
): string | null {
  if (!run) return null;
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    const ev = run.events[i]!;
    if (ev.detail === "live-progress" && ev.summary.trim()) {
      return ev.summary.trim();
    }
  }
  return null;
}

export async function startPipelineHistoryRun(input: {
  romanId: string;
  trigger: PipelineHistoryTrigger;
  originStage: string;
  firstEvent?: PipelineHistoryEvent;
}): Promise<string> {
  const events = input.firstEvent ? [input.firstEvent] : [];
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_insert_roman_pipeline_history",
    {
      p_roman_id: input.romanId,
      p_trigger: input.trigger,
      p_origin_stage: input.originStage,
      p_status: "running",
      p_events: events,
    },
  );
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Replace events + status for a run (caller keeps full event list in memory).
 */
export async function updatePipelineHistoryRun(input: {
  runId: string;
  status: string;
  events: PipelineHistoryEvent[];
}): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_update_roman_pipeline_history", {
    p_id: input.runId,
    p_status: input.status,
    p_events: input.events,
  });
  if (error) throw new Error(error.message);
}

/** Delete one history run. */
export async function deletePipelineHistoryRun(runId: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc(
    "admin_delete_roman_pipeline_history",
    { p_id: runId },
  );
  if (error) throw new Error(error.message);
}

export function historyEvent(
  partial: Omit<PipelineHistoryEvent, "at"> & { at?: string },
): PipelineHistoryEvent {
  return {
    at: partial.at ?? new Date().toISOString(),
    type: partial.type,
    stage: partial.stage,
    roleKey: partial.roleKey,
    modelLabel: partial.modelLabel,
    summary: partial.summary,
    detail: partial.detail,
    targets: partial.targets,
    usage: partial.usage,
    critique: partial.critique,
    critiqueText: partial.critiqueText,
  };
}
