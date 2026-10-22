/**
 * Background Erzeugen job: draft (+ optional Reifegrad) + finish.
 * Started via API `after()` so the wait dialog only polls history — not one
 * long Server Action HTTP response (browser/proxy timeouts).
 *
 * Long Manuskript runs use chunk budgets: stop before platform kill, keep
 * status `running`, return `continue` so the route self-kicks a new hop.
 *
 * Reifegrad is hardened: after a successful draft we verify the stage score
 * exists and retry assess if the in-draft `assessAfter` was skipped/failed
 * (common when long Gerüst jobs hit maxDuration during scoring).
 *
 * Gerüst/Plot: after draft+Reifegrad, internal Logik auto-repair
 * (analyze→apply, max 3) until hard-gate green — no Verbessern dialog.
 */

import {
  emptyRomanEditorial,
  withPipelineTabFertig,
  type RomanPipelineFertig,
} from "@/lib/roman/editorial";
import { getRomanKontext, setRomanEditorial } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import {
  createGenerateChunkBudget,
  formatGenerateHopDetail,
  GENERATE_CONTINUE_DETAIL,
  GENERATE_MAX_CONTINUE_HOPS,
  latestGenerateHop,
} from "@/lib/roman/pipeline/generate-budget";
import {
  formatGenerateWorkerLockDetail,
  hopWorkerLockIsFresh,
} from "@/lib/roman/pipeline/generate-stale-watchdog";
import {
  getPipelineHistoryRun,
  historyEvent,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import {
  pipelineStepAssessReifegrad,
  pipelineStepDraft,
  pipelineStepDraftSpec,
  pipelineStepFinish,
} from "@/lib/roman/pipeline/runner";
import {
  cleverManuskriptSkipsReifegrad,
  isGeruestStage,
  isPlotStage,
  normalizePipelineStage,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { missingManuskriptChapterNumbers } from "@/lib/roman/plot-chapters";
import {
  analyzeStageVerbessern,
  applyStageVerbessern,
} from "@/lib/roman/stage-verbessern";
import {
  evaluateStageHardGate,
  stageUsesAutoLogikRepair,
} from "@/lib/roman/stage-hard-gates";

/** Max internal Logik repair loops after Plot Erzeugen. */
const AUTO_LOGIK_REPAIR_MAX = 3;

export type RomanGenerateJobInput = {
  romanId: string;
  runId: string;
  stage: PipelineStage;
  /** `spec-chain` = Charaktere → Welt → Exposé. */
  generateMode: "stage" | "spec-chain";
  showAssess: boolean;
};

export type RomanGenerateJobOutcome = {
  /** `noop` = another worker already owns this hop (fresh lock). */
  outcome: "ok" | "error" | "continue" | "noop";
  message?: string;
};

async function loadEvents(
  romanId: string,
  runId: string,
): Promise<PipelineHistoryEvent[]> {
  const run = await getPipelineHistoryRun(romanId, runId);
  return run?.events ?? [];
}

async function stageHasReifegrad(
  romanId: string,
  stage: PipelineStage,
): Promise<boolean> {
  const roman = await getRomanKontext(romanId);
  if (!roman) return false;
  const score = roman.editorial?.reifegrade?.[stage];
  return Boolean(score && typeof score.gesamtPct === "number");
}

/** True when this run already logged a successful Bewerter score (not a stale DB value). */
function eventsHaveSuccessfulReifegrad(
  events: PipelineHistoryEvent[],
  stage: PipelineStage,
): boolean {
  return events.some(
    (e) =>
      e.stage === stage &&
      e.type === "info" &&
      e.roleKey === "bewerter" &&
      /^Reifegrad:\s*\d+%/i.test(e.summary),
  );
}

function stageSkipsReifegrad(
  romanBuchTyp: string | null | undefined,
  stage: PipelineStage,
): boolean {
  return cleverManuskriptSkipsReifegrad(romanBuchTyp, stage);
}

function fertigTabForStage(
  stage: PipelineStage,
): keyof RomanPipelineFertig | null {
  const n = normalizePipelineStage(stage) ?? stage;
  if (n === "idee") return "idee";
  if (n === "rahmen") return "rahmen";
  if (n === "fundament") return "fundament";
  if (n === "expose") return "expose";
  if (n === "graph") return "graph";
  if (n === "plot" || isGeruestStage(stage)) return "plot";
  if (n === "szenen" || isPlotStage(stage)) return "szenen";
  if (n === "manuskript") return "schreiben";
  return null;
}

/**
 * After Gerüst/Plot draft: hard-gate check + up to N Logik analyze→apply cycles.
 * Does not use Verbessern UI; failures finish the generate job as error.
 */
async function runAutoLogikRepairLoop(input: {
  romanId: string;
  stage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
}): Promise<{
  ok: boolean;
  events: PipelineHistoryEvent[];
  error?: string;
}> {
  if (!stageUsesAutoLogikRepair(input.stage)) {
    return { ok: true, events: input.events };
  }
  let events = input.events;
  const repairStage: PipelineStage =
    (normalizePipelineStage(input.stage) as PipelineStage | null) ??
    input.stage;

  for (let attempt = 0; attempt <= AUTO_LOGIK_REPAIR_MAX; attempt++) {
    const roman = await getRomanKontext(input.romanId);
    if (!roman) {
      return { ok: false, events, error: "Buch nicht gefunden." };
    }
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const gate = evaluateStageHardGate({
      stage: repairStage,
      editorial,
      tonalitaet: roman.tonalitaet,
      genre: roman.genre,
    });
    if (gate.ok && !gate.viaOverride) {
      const tab = fertigTabForStage(repairStage);
      if (tab) {
        const nextEd = withPipelineTabFertig(editorial, tab, true);
        await setRomanEditorial(input.romanId, nextEd);
      }
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          summary: `Hard-Gate grün · ${PIPELINE_STAGE_LABELS[repairStage] ?? repairStage}`,
          detail: gate.summary,
        }),
      );
      return { ok: true, events };
    }
    if (gate.ok && gate.viaOverride) {
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          summary: `Hard-Gate mit Override · ${PIPELINE_STAGE_LABELS[repairStage] ?? repairStage}`,
          detail: gate.summary,
        }),
      );
      return { ok: true, events };
    }
    if (attempt >= AUTO_LOGIK_REPAIR_MAX) {
      const detail = gate.findings
        .filter((f) => f.severity === "error")
        .slice(0, 8)
        .map((e) => `• ${e.message}`)
        .join("\n");
      return {
        ok: false,
        events,
        error: `${gate.summary}\n${detail}\n\nAuto-Repair (${AUTO_LOGIK_REPAIR_MAX}× Logik) konnte das Gate nicht schließen.`,
      };
    }

    events.push(
      historyEvent({
        type: "info",
        stage: input.stage,
        summary: `Auto-Repair Logik ${attempt + 1}/${AUTO_LOGIK_REPAIR_MAX} · ${PIPELINE_STAGE_LABELS[repairStage]}`,
        detail: gate.findings
          .filter((f) => f.severity === "error")
          .slice(0, 4)
          .map((e) => e.message)
          .join(" · "),
      }),
    );
    try {
      await updatePipelineHistoryRun({
        runId: input.runId,
        status: "running",
        events,
      });
    } catch {
      /* fail-soft */
    }

    try {
      await analyzeStageVerbessern({
        romanId: input.romanId,
        stage: repairStage,
        focus: "logik",
      });
      await applyStageVerbessern({
        romanId: input.romanId,
        stage: repairStage,
      });
      const ensured = await ensureStageReifegrad({
        romanId: input.romanId,
        stage: repairStage,
        runId: input.runId,
        events,
        changeSummary: `Nach Auto-Repair Logik ${attempt + 1}.`,
        attempts: 1,
      });
      events = ensured.events;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Auto-Repair fehlgeschlagen.";
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          summary: `Auto-Repair abgebrochen: ${message.slice(0, 200)}`,
        }),
      );
      return { ok: false, events, error: message };
    }
  }

  return {
    ok: false,
    events,
    error: "Auto-Repair: unerwartetes Ende.",
  };
}
/**
 * Ensure Reifegrad was measured in this Erzeugen run. Retries when the in-draft
 * `assessAfter` was skipped/failed so Gerüst/Plot never finish unscored.
 * Requires a Bewerter event in this run — a leftover score alone is not enough.
 */
async function ensureStageReifegrad(input: {
  romanId: string;
  stage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
  changeSummary: string;
  attempts?: number;
}): Promise<{
  events: PipelineHistoryEvent[];
  ok: boolean;
  error?: string;
}> {
  const attempts = Math.max(1, input.attempts ?? 2);
  let events = [...input.events];

  for (let i = 0; i < attempts; i += 1) {
    if (eventsHaveSuccessfulReifegrad(events, input.stage)) {
      return { events, ok: true };
    }

    if (i > 0) {
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          summary: `Reifegrad fehlt noch — erneuter Versuch (${i + 1}/${attempts}) …`,
        }),
      );
    }

    const assessed = await pipelineStepAssessReifegrad({
      romanId: input.romanId,
      stage: input.stage,
      runId: input.runId,
      events,
      changeSummary: input.changeSummary,
    });
    events = assessed.events;

    if (assessed.status === "error") {
      if (i === attempts - 1) {
        return {
          events,
          ok: false,
          error: assessed.error ?? "Reifegrad-Bewertung fehlgeschlagen.",
        };
      }
      continue;
    }

    if (
      eventsHaveSuccessfulReifegrad(events, input.stage) &&
      (await stageHasReifegrad(input.romanId, input.stage))
    ) {
      return { events, ok: true };
    }
  }

  return {
    events,
    ok: false,
    error: `Reifegrad für ${PIPELINE_STAGE_LABELS[input.stage]} fehlt nach dem Entwurf — Messung konnte nicht gespeichert werden.`,
  };
}

async function manuskriptStillIncomplete(romanId: string): Promise<boolean> {
  const roman = await getRomanKontext(romanId, { omitCover: true });
  if (!roman) return false;
  const plot = roman.manuskriptRaw ?? "";
  const text = roman.editorial?.manuskriptText ?? "";
  if (!plot.trim() || !text.trim()) return Boolean(plot.trim());
  return missingManuskriptChapterNumbers(plot, text).length > 0;
}

/**
 * Runs to completion, or returns `continue` for the next worker hop.
 * Safe to call from `after()` — does not depend on the client connection.
 */
export async function runRomanGenerateJob(
  input: RomanGenerateJobInput,
): Promise<RomanGenerateJobOutcome> {
  const { romanId, runId, stage, generateMode, showAssess } = input;

  const existing = await getPipelineHistoryRun(romanId, runId);
  if (!existing) {
    return { outcome: "error", message: "Pipeline-Lauf nicht gefunden." };
  }
  if (existing.status === "ok" || existing.status === "error") {
    return { outcome: existing.status === "ok" ? "ok" : "error" };
  }

  let events = [...existing.events];
  const hop = latestGenerateHop(events) + 1;
  if (hop > GENERATE_MAX_CONTINUE_HOPS) {
    await pipelineStepFinish({
      romanId,
      runId,
      events: [
        ...events,
        historyEvent({
          type: "error",
          stage,
          summary: `Zu viele automatische Fortsetzungen (${GENERATE_MAX_CONTINUE_HOPS}). Bitte Erzeugen erneut starten.`,
        }),
      ],
      ok: false,
      error: `Zu viele automatische Fortsetzungen (${GENERATE_MAX_CONTINUE_HOPS}).`,
    });
    revalidateRomanAdmin(romanId);
    return { outcome: "error", message: "Zu viele Fortsetzungs-Hops." };
  }

  // Another instance already claimed this hop and is still writing.
  if (hopWorkerLockIsFresh(events, hop)) {
    return {
      outcome: "noop",
      message: `Hop ${hop} läuft bereits — kein zweiter Worker.`,
    };
  }

  events.push(
    historyEvent({
      type: "info",
      stage,
      summary:
        hop <= 1
          ? "Erzeugen · Worker gestartet"
          : `Erzeugen · Fortsetzung Hop ${hop}`,
      detail: formatGenerateHopDetail(hop),
    }),
  );
  events.push(
    historyEvent({
      type: "info",
      stage,
      summary: `Worker-Lock Hop ${hop}`,
      detail: formatGenerateWorkerLockDetail(hop),
    }),
  );
  try {
    await updatePipelineHistoryRun({
      runId,
      status: "running",
      events,
    });
  } catch {
    /* fail-soft */
  }

  const chunkBudget =
    stage === "manuskript" && generateMode === "stage"
      ? createGenerateChunkBudget()
      : undefined;

  try {
    if (generateMode === "spec-chain") {
      const drafted = await pipelineStepDraftSpec({
        romanId,
        runId,
        events,
      });
      events = drafted.events;
      if (drafted.status === "error") {
        await finishIfStillRunning({
          romanId,
          runId,
          events,
          error: drafted.error ?? "Spec-Entwurf fehlgeschlagen.",
        });
        revalidateRomanAdmin(romanId);
        return { outcome: "error", message: drafted.error };
      }

      if (showAssess) {
        events = drafted.events.length
          ? drafted.events
          : await loadEvents(romanId, runId);
        const ensured = await ensureStageReifegrad({
          romanId,
          stage: "expose",
          runId,
          events,
          changeSummary: "Frischer Spec-Entwurf (Figuren → Welt → Exposé).",
          attempts: 2,
        });
        events = ensured.events;
        if (!ensured.ok) {
          await pipelineStepFinish({
            romanId,
            runId,
            events,
            ok: false,
            error: ensured.error ?? "Reifegrad-Bewertung fehlgeschlagen.",
          });
          revalidateRomanAdmin(romanId);
          return { outcome: "error", message: ensured.error };
        }
      }
    } else {
      // Measure Reifegrad inside the draft step so long Gerüst jobs still score
      // before the background worker hits maxDuration after the draft returns.
      const drafted = await pipelineStepDraft({
        romanId,
        stage,
        runId,
        events,
        assessAfter: showAssess,
        chunkBudget,
      });
      events = drafted.events;

      if (drafted.status === "continue") {
        revalidateRomanAdmin(romanId);
        return {
          outcome: "continue",
          message: drafted.progressLabel,
        };
      }

      const draftFailed =
        drafted.status === "error" &&
        !/reifegrad/i.test(drafted.error ?? "");
      if (draftFailed) {
        // Incomplete Manuskript after crash → auto-continue instead of dead end.
        if (
          stage === "manuskript" &&
          (await manuskriptStillIncomplete(romanId))
        ) {
          events.push(
            historyEvent({
              type: "info",
              stage,
              summary:
                drafted.error ??
                "Abbruch mit Teilstand — automatische Fortsetzung …",
              detail: GENERATE_CONTINUE_DETAIL,
            }),
          );
          try {
            await updatePipelineHistoryRun({
              runId,
              status: "running",
              events,
            });
          } catch {
            /* fail-soft */
          }
          revalidateRomanAdmin(romanId);
          return {
            outcome: "continue",
            message: drafted.error,
          };
        }
        await finishIfStillRunning({
          romanId,
          runId,
          events,
          error: drafted.error ?? "Erzeugen fehlgeschlagen.",
        });
        revalidateRomanAdmin(romanId);
        return { outcome: "error", message: drafted.error };
      }

      // Draft ok, or draft ok but in-step assess failed/timed out → ensure score.
      if (showAssess) {
        const roman = await getRomanKontext(romanId);
        const buchTyp =
          roman?.editorial?.buchTyp ??
          emptyRomanEditorial().buchTyp;
        if (!stageSkipsReifegrad(buchTyp, stage)) {
          events = events.length ? events : await loadEvents(romanId, runId);
          const ensured = await ensureStageReifegrad({
            romanId,
            stage,
            runId,
            events,
            changeSummary: `Frischer Entwurf von ${PIPELINE_STAGE_LABELS[stage]}.`,
            attempts: 2,
          });
          events = ensured.events;
          if (!ensured.ok) {
            await pipelineStepFinish({
              romanId,
              runId,
              events,
              ok: false,
              error: ensured.error ?? "Reifegrad-Bewertung fehlgeschlagen.",
            });
            revalidateRomanAdmin(romanId);
            return { outcome: "error", message: ensured.error };
          }
        }
      }
    }

    events = events.length ? events : await loadEvents(romanId, runId);

    if (generateMode === "stage" && stageUsesAutoLogikRepair(stage)) {
      const repaired = await runAutoLogikRepairLoop({
        romanId,
        stage,
        runId,
        events,
      });
      events = repaired.events;
      if (!repaired.ok) {
        await pipelineStepFinish({
          romanId,
          runId,
          events,
          ok: false,
          error: repaired.error ?? "Hard-Gate / Auto-Repair fehlgeschlagen.",
        });
        revalidateRomanAdmin(romanId);
        return { outcome: "error", message: repaired.error };
      }
    } else if (generateMode === "spec-chain") {
      const roman = await getRomanKontext(romanId);
      if (roman) {
        const gate = evaluateStageHardGate({
          stage: "spec",
          editorial: roman.editorial ?? emptyRomanEditorial(),
          tonalitaet: roman.tonalitaet,
          genre: roman.genre,
        });
        if (!gate.ok) {
          const detail = gate.findings
            .filter((f) => f.severity === "error")
            .slice(0, 6)
            .map((e) => `• ${e.message}`)
            .join("\n");
          const error = `${gate.summary}\n${detail}`;
          events.push(
            historyEvent({
              type: "info",
              stage: "expose",
              summary: "Spec-Hard-Gate rot",
              detail: error.slice(0, 2_000),
            }),
          );
          await pipelineStepFinish({
            romanId,
            runId,
            events,
            ok: false,
            error,
          });
          revalidateRomanAdmin(romanId);
          return { outcome: "error", message: error };
        }
        if (!gate.viaOverride) {
          const ed = withPipelineTabFertig(
            roman.editorial ?? emptyRomanEditorial(),
            "spec",
            true,
          );
          await setRomanEditorial(romanId, ed);
        }
      }
    }

    await pipelineStepFinish({
      romanId,
      runId,
      events,
      ok: true,
    });
    revalidateRomanAdmin(romanId);
    return { outcome: "ok" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erzeugen fehlgeschlagen.";
    try {
      events = await loadEvents(romanId, runId);
      const run = await getPipelineHistoryRun(romanId, runId);
      if (run?.status === "error") {
        revalidateRomanAdmin(romanId);
        return { outcome: "error", message };
      }
      if (run?.status === "ok") {
        revalidateRomanAdmin(romanId);
        return { outcome: "ok" };
      }

      if (
        stage === "manuskript" &&
        generateMode === "stage" &&
        (await manuskriptStillIncomplete(romanId))
      ) {
        events.push(
          historyEvent({
            type: "info",
            stage,
            summary: `${message} — Teilstand gespeichert, automatische Fortsetzung …`,
            detail: GENERATE_CONTINUE_DETAIL,
          }),
        );
        await updatePipelineHistoryRun({
          runId,
          status: "running",
          events,
        });
        revalidateRomanAdmin(romanId);
        return { outcome: "continue", message };
      }

      // Last-chance: draft may already be persisted — still try Reifegrad.
      if (showAssess && generateMode !== "spec-chain") {
        try {
          const roman = await getRomanKontext(romanId);
          const buchTyp = roman?.editorial?.buchTyp;
          const hasDraftArtifact =
            isGeruestStage(stage)
              ? Boolean(
                  roman?.editorial?.kapitelGeruestStructured?.chapters.length,
                )
              : isPlotStage(stage)
                ? Boolean(
                    roman?.editorial?.szenenplotStructured?.chapters.length,
                  )
                : stage === "manuskript"
                  ? Boolean(roman?.editorial?.manuskriptText?.trim())
                  : true;
          if (
            hasDraftArtifact &&
            !stageSkipsReifegrad(buchTyp, stage) &&
            !(await stageHasReifegrad(romanId, stage))
          ) {
            const ensured = await ensureStageReifegrad({
              romanId,
              stage,
              runId,
              events,
              changeSummary: `Nachholung nach Abbruch: ${PIPELINE_STAGE_LABELS[stage]}.`,
              attempts: 1,
            });
            events = ensured.events;
            if (ensured.ok) {
              await pipelineStepFinish({
                romanId,
                runId,
                events,
                ok: true,
              });
              revalidateRomanAdmin(romanId);
              return { outcome: "ok" };
            }
          }
        } catch {
          /* fall through to error finish */
        }
      }

      await pipelineStepFinish({
        romanId,
        runId,
        events,
        ok: false,
        error: message,
      });
    } catch {
      /* best-effort finish */
    }
    revalidateRomanAdmin(romanId);
    return { outcome: "error", message };
  }
}

/** True draft failures already set history `error`; assess-after may leave `running`. */
async function finishIfStillRunning(input: {
  romanId: string;
  runId: string;
  events: PipelineHistoryEvent[];
  error: string;
}): Promise<void> {
  const run = await getPipelineHistoryRun(input.romanId, input.runId);
  if (!run || run.status === "ok" || run.status === "error") return;
  await pipelineStepFinish({
    romanId: input.romanId,
    runId: input.runId,
    events: input.events.length ? input.events : run.events,
    ok: false,
    error: input.error,
  });
}
