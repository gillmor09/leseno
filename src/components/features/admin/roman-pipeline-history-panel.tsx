"use client";

/**
 * Collapsible pipeline run history — token usage + deletable runs.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteRomanPipelineHistoryAction,
  loadRomanPipelineHistoryAction,
} from "@/app/actions/roman-pipeline";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { formatUsageLine } from "@/lib/ai/usage-types";
import type { PipelineHistoryRun } from "@/lib/roman/pipeline/history";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { cn } from "@/lib/utils";

const TRIGGER_LABELS: Record<string, string> = {
  auto_generate: "Erzeugen",
  manual_critique: "Verbessern",
  manual_critique_only: "Kritik",
  cascade_regen: "Kaskade",
  dimension_improve: "Dimension",
  dimension_analyze: "Dim.-Analyse",
  dimension_apply: "Dim.-Einarbeiten",
  reifegrad_assess: "Reifegrad",
  leser_feedback: "Leser-Feedback",
  leser_feedback_apply: "Feedback einarbeiten",
  manuskript_vereinfachen: "Vereinfachen",
  manuskript_original_restore: "Original wiederherstellen",
  stage_verbessern_analyze: "Gesamt-Analyse",
  stage_verbessern_apply: "Gesamt einarbeiten",
  canon_logic_plan: "Logik-Pass Plan",
  canon_logic_apply: "Logik-Pass Übernehmen",
  manuskript_chapter: "Einzelkapitel",
};

function runUsageTotals(run: PipelineHistoryRun) {
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let any = false;
  for (const ev of run.events) {
    if (!ev.usage) continue;
    any = true;
    input += ev.usage.inputTokens;
    output += ev.usage.outputTokens;
    reasoning += ev.usage.reasoningTokens ?? 0;
    cacheRead += ev.usage.cacheReadTokens ?? 0;
    cacheWrite += ev.usage.cacheWriteTokens ?? 0;
  }
  if (!any) return null;
  return formatUsageLine({
    inputTokens: input,
    outputTokens: output,
    reasoningTokens: reasoning > 0 ? reasoning : undefined,
    cacheReadTokens: cacheRead > 0 ? cacheRead : undefined,
    cacheWriteTokens: cacheWrite > 0 ? cacheWrite : undefined,
  });
}

function historyRunTitle(run: PipelineHistoryRun): string {
  const stage =
    PIPELINE_STAGE_LABELS[run.originStage as PipelineStage] ?? run.originStage;
  const trigger = TRIGGER_LABELS[run.trigger] ?? run.trigger;
  return `${stage} · ${trigger}`;
}

export function RomanPipelineHistoryPanel({
  romanId,
  refreshKey = 0,
  canDelete = true,
  /** When set, only runs started from this pipeline stage are shown. */
  originStage,
}: {
  romanId: string;
  /** Bump to reload after a run. */
  refreshKey?: number;
  canDelete?: boolean;
  originStage?: string;
}) {
  const [runs, setRuns] = useState<PipelineHistoryRun[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteRun, setDeleteRun] = useState<PipelineHistoryRun | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadRomanPipelineHistoryAction({
      romanId,
      limit: 40,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "Historie nicht ladbar.");
      setRuns([]);
      return;
    }
    setRuns(result.data!.runs);
  }, [romanId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visibleRuns = originStage
    ? runs.filter((r) => r.originStage === originStage)
    : runs;

  async function confirmDelete() {
    if (!deleteRun || deletePending) return;
    setDeletePending(true);
    const result = await deleteRomanPipelineHistoryAction({
      romanId,
      runId: deleteRun.id,
    });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setRuns((current) => current.filter((r) => r.id !== deleteRun.id));
    if (openId === deleteRun.id) setOpenId(null);
    setDeleteRun(null);
    toast.success("Historie-Eintrag gelöscht.");
  }

  const originStageTitle =
    originStage && originStage in PIPELINE_STAGE_LABELS
      ? PIPELINE_STAGE_LABELS[originStage as PipelineStage]
      : originStage;

  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-zinc-950">
          KI-Historie
          {originStageTitle ? (
            <span className="ml-1.5 text-sm font-semibold text-zinc-500">
              · {originStageTitle}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-bold text-orange-800 hover:underline"
        >
          Aktualisieren
        </button>
      </div>
      <p className="mt-1 text-xs font-semibold text-zinc-500">
        Läufe, Analyse, Tokens (In / Out / Think / Cache) — eingeklappt.
      </p>

      {loading ? (
        <p className="mt-4 text-sm font-semibold text-zinc-500">Laden …</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          {error}
        </p>
      ) : null}
      {!loading && !error && visibleRuns.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-zinc-500">
          {originStage
            ? "Noch keine Läufe für diesen Schritt."
            : "Noch keine Läufe."}
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {visibleRuns.map((run) => {
          const open = openId === run.id;
          const when = new Date(run.createdAt).toLocaleString("de-DE");
          const totals = runUsageTotals(run);
          const title = historyRunTitle(run);
          return (
            <li
              key={run.id}
              className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-950/8"
            >
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : run.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-zinc-900">
                      {title}
                    </span>
                    <span className="block text-xs font-semibold text-zinc-500">
                      {when} · {run.status} · {run.events.length} Events
                    </span>
                    {totals ? (
                      <span className="mt-0.5 block font-mono text-[11px] font-semibold text-zinc-600">
                        Σ {totals}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs font-extrabold text-zinc-400">
                    {open ? "−" : "+"}
                  </span>
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => setDeleteRun(run)}
                    className="shrink-0 px-3 text-xs font-bold text-red-800 hover:underline"
                  >
                    Löschen
                  </button>
                ) : null}
              </div>
              {open ? (
                <ol className="space-y-2 border-t border-zinc-200/80 px-4 py-3">
                  {run.events.map((ev, i) => {
                    const usageLine = formatUsageLine(ev.usage);
                    return (
                      <li key={`${run.id}-${i}`} className="text-sm">
                        <p
                          className={cn(
                            "font-bold",
                            ev.type === "error"
                              ? "text-red-800"
                              : "text-zinc-900",
                          )}
                        >
                          [{ev.type}]
                          {ev.stage ? ` ${ev.stage}` : ""} — {ev.summary}
                        </p>
                        {ev.modelLabel ? (
                          <p className="text-xs font-semibold text-zinc-500">
                            {ev.modelLabel}
                            {ev.roleKey ? ` · ${ev.roleKey}` : ""}
                          </p>
                        ) : null}
                        {usageLine ? (
                          <p className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-600">
                            {usageLine}
                          </p>
                        ) : null}
                        {ev.targets?.length ? (
                          <ul className="mt-1 list-disc pl-5 text-xs font-semibold text-zinc-600">
                            {ev.targets.map((t, j) => (
                              <li key={j}>
                                {t.stage}: {t.reason}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {ev.detail ? (
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-950/5">
                            {ev.detail}
                          </pre>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDeleteDialog
        open={Boolean(deleteRun)}
        title="Historie-Eintrag löschen?"
        description={
          deleteRun
            ? `Der Lauf „${historyRunTitle(deleteRun)}“ vom ${new Date(
                deleteRun.createdAt,
              ).toLocaleString("de-DE")} wird unwiderruflich gelöscht (inkl. aller Events und Token-Angaben).`
            : ""
        }
        confirmLabel="Eintrag löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteRun(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
