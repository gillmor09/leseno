/**
 * Background Erzeugen job: draft (+ optional Reifegrad) + finish.
 * Started via API `after()` so the wait dialog only polls history — not one
 * long Server Action HTTP response (browser/proxy timeouts).
 *
 * Reifegrad is hardened: after a successful draft we verify the stage score
 * exists and retry assess if the in-draft `assessAfter` was skipped/failed
 * (common when long Gerüst jobs hit maxDuration during scoring).
 */

import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { getRomanKontext } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import {
  getPipelineHistoryRun,
  historyEvent,
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
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";

export type RomanGenerateJobInput = {
  romanId: string;
  runId: string;
  stage: PipelineStage;
  /** `spec-chain` = Charaktere → Welt → Exposé. */
  generateMode: "stage" | "spec-chain";
  showAssess: boolean;
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

/**
 * Runs to completion and marks history `ok` / `error`.
 * Safe to call from `after()` — does not depend on the client connection.
 */
export async function runRomanGenerateJob(
  input: RomanGenerateJobInput,
): Promise<void> {
  const { romanId, runId, stage, generateMode, showAssess } = input;

  const existing = await getPipelineHistoryRun(romanId, runId);
  if (!existing) {
    return;
  }
  if (existing.status === "ok" || existing.status === "error") {
    return;
  }

  let events = [...existing.events];

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
        return;
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
          return;
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
      });
      events = drafted.events;

      const draftFailed =
        drafted.status === "error" &&
        !/reifegrad/i.test(drafted.error ?? "");
      if (draftFailed) {
        await finishIfStillRunning({
          romanId,
          runId,
          events,
          error: drafted.error ?? "Erzeugen fehlgeschlagen.",
        });
        revalidateRomanAdmin(romanId);
        return;
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
            return;
          }
        }
      }
    }

    events = events.length ? events : await loadEvents(romanId, runId);
    await pipelineStepFinish({
      romanId,
      runId,
      events,
      ok: true,
    });
    revalidateRomanAdmin(romanId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erzeugen fehlgeschlagen.";
    try {
      events = await loadEvents(romanId, runId);
      const run = await getPipelineHistoryRun(romanId, runId);
      if (run?.status === "error") {
        revalidateRomanAdmin(romanId);
        return;
      }

      // Last-chance: draft may already be persisted — still try Reifegrad.
      if (showAssess && generateMode !== "spec-chain") {
        try {
          const roman = await getRomanKontext(romanId);
          const buchTyp = roman?.editorial?.buchTyp;
          const hasDraftArtifact =
            stage === "kapitelgeruest"
              ? Boolean(
                  roman?.editorial?.kapitelGeruestStructured?.chapters.length,
                )
              : stage === "szenenplot"
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
              return;
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
