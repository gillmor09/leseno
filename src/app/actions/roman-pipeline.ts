"use server";

/**
 * Vertical pipeline runs + task/history admin for Buch.
 * Prefer step actions (start → draft → assess → finish for Erzeugen;
 * start → critique → cascade → finish for Verbessern) for live progress.
 */

import { revalidateRomanAdmin, revalidateRomanAdminRollen } from "@/lib/roman/revalidate-admin";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  formatCritiqueForPrompt,
  deletePipelineHistoryRun,
  listPipelineHistory,
  type PipelineHistoryEvent,
  type PipelineHistoryRun,
} from "@/lib/roman/pipeline";
import {
  pipelineStepAssessReifegrad,
  pipelineStepCascade,
  pipelineStepCritique,
  pipelineStepDraft,
  pipelineStepDraftSpec,
  pipelineStepFinish,
  pipelineStepStart,
  type PipelineStepResult,
} from "@/lib/roman/pipeline/runner";
import {
  PIPELINE_STAGES,
  cleverManuskriptSkipsReifegrad,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import {
  loadPipelineAufgaben,
  savePipelineAufgabe,
  type RomanPipelineAufgabe,
} from "@/lib/roman/pipeline/tasks";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { getRomanKontext } from "@/lib/roman/repository";
import { ALL_REIFEGRAD_DIMENSION_KEYS } from "@/lib/roman/reifegrad-craft";
import type { ActionResult } from "@/lib/types/actions";

const stageSchema = z.enum(PIPELINE_STAGES);
const dimensionSchema = z.enum(ALL_REIFEGRAD_DIMENSION_KEYS);

const runSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  stage: stageSchema,
});

const stepBaseSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  stage: stageSchema,
  runId: z.string().uuid({ message: "Ungültige Lauf-ID." }),
  events: z.array(z.unknown()).max(200),
});

const aufgabeSaveSchema = z.object({
  taskKey: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  stage: z.string().min(1).max(40),
  kind: z.enum(["draft", "critique", "router", "dialog"]),
  rolleKey: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(10_000),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Eingabe ungültig.";
}

function asEvents(value: unknown[]): PipelineHistoryEvent[] {
  return value.filter(
    (e) =>
      e &&
      typeof e === "object" &&
      typeof (e as { summary?: unknown }).summary === "string",
  ) as PipelineHistoryEvent[];
}

function revalidateBook(romanId: string) {
  revalidateRomanAdmin(romanId);
}

const CLEVER_MANUSKRIPT_REIFEGRAD_BLOCKED =
  "Bei Clever erzählt gibt es keinen übergeordneten Manuskript-Reifegrad — bitte je Kurzgeschichte gegenlesen oder verbessern.";

async function denyCleverManuskriptReifegrad(
  romanId: string,
  stage: PipelineStage,
): Promise<string | null> {
  const roman = await getRomanKontext(romanId);
  if (!roman) return "Buch nicht gefunden.";
  const buchTyp = (roman.editorial ?? emptyRomanEditorial()).buchTyp;
  if (cleverManuskriptSkipsReifegrad(buchTyp, stage)) {
    return CLEVER_MANUSKRIPT_REIFEGRAD_BLOCKED;
  }
  return null;
}

function stepResult(
  result: PipelineStepResult,
): ActionResult<PipelineStepResult> {
  if (result.status === "error") {
    return {
      success: false,
      error: result.error ?? "Pipeline-Schritt fehlgeschlagen.",
      data: result,
    };
  }
  return { success: true, data: result };
}

/** Start history run (no LLM). */
export async function romanPipelineStepStartAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = runSchema
    .extend({
      includeDraft: z.boolean(),
      /** True = Gegenlese ohne Router/Patches. */
      critiqueOnly: z.boolean().optional().default(false),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const trigger = parsed.data.includeDraft
      ? "auto_generate"
      : parsed.data.critiqueOnly
        ? "manual_critique_only"
        : "manual_critique";
    const result = await pipelineStepStart({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      trigger,
      includeDraft: parsed.data.includeDraft,
      critiqueOnly: Boolean(parsed.data.critiqueOnly),
    });
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pipeline-Start fehlgeschlagen.",
    };
  }
}

/** Draft step (one stage). */
export async function romanPipelineStepDraftAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = stepBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await pipelineStepDraft({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      runId: parsed.data.runId,
      events: asEvents(parsed.data.events),
    });
    revalidateBook(parsed.data.romanId);
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pipeline-Entwurf fehlgeschlagen.",
    };
  }
}

/**
 * Spec Erzeugen: drafts Charaktere → Welt → Exposé, then clears Kapitelgerüst/Manuskript.
 * Start the run with `stage: "expose"` so history stays under Spec/Exposé.
 */
export async function romanPipelineStepDraftSpecAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      runId: z.string().uuid({ message: "Ungültige Lauf-ID." }),
      events: z.array(z.unknown()).max(200),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await pipelineStepDraftSpec({
      romanId: parsed.data.romanId,
      runId: parsed.data.runId,
      events: asEvents(parsed.data.events),
    });
    revalidateBook(parsed.data.romanId);
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Spec-Entwurf fehlgeschlagen.",
    };
  }
}

/** Reifegrad step after Erzeugen (or after Verbessern cascade). */
export async function romanPipelineStepAssessAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = stepBaseSchema
    .extend({
      changeSummary: z.string().max(500).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await pipelineStepAssessReifegrad({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      runId: parsed.data.runId,
      events: asEvents(parsed.data.events),
      changeSummary: parsed.data.changeSummary,
    });
    revalidateBook(parsed.data.romanId);
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Reifegrad-Bewertung fehlgeschlagen.",
    };
  }
}

/** Critique step. */
export async function romanPipelineStepCritiqueAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = stepBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const result = await pipelineStepCritique({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      runId: parsed.data.runId,
      events: asEvents(parsed.data.events),
    });
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pipeline-Gegenlese fehlgeschlagen.",
    };
  }
}

/** Route + apply upstream + clear downstream. Critique is loaded from run history. */
export async function romanPipelineStepCascadeAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      runId: z.string().uuid({ message: "Ungültige Lauf-ID." }),
      /** Only patch current stage — no upstream / chain regen. */
      localOnly: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const runs = await listPipelineHistory(parsed.data.romanId, 40);
    const run = runs.find((r) => r.id === parsed.data.runId);
    if (!run) {
      return { success: false, error: "Pipeline-Lauf nicht gefunden." };
    }
    const critiqueEvent = [...run.events]
      .reverse()
      .find((e) => e.type === "critique" && e.critique);
    if (!critiqueEvent?.critique) {
      return {
        success: false,
        error:
          "Keine gespeicherte Gegenlese für diesen Lauf — bitte Gegenlese erneut starten.",
      };
    }
    const critiqueText =
      critiqueEvent.critiqueText?.trim() ||
      formatCritiqueForPrompt(critiqueEvent.critique);

    const result = await pipelineStepCascade({
      romanId: parsed.data.romanId,
      originStage: parsed.data.stage,
      runId: parsed.data.runId,
      events: run.events,
      critique: critiqueEvent.critique,
      critiqueText,
      localOnly: parsed.data.localOnly === true,
    });
    revalidateBook(parsed.data.romanId);
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pipeline-Cascade fehlgeschlagen.",
    };
  }
}

/** Finish run (status ok/error). Events are reloaded from history when omitted. */
export async function romanPipelineStepFinishAction(
  input: unknown,
): Promise<ActionResult<PipelineStepResult>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid(),
      runId: z.string().uuid(),
      events: z.array(z.unknown()).max(200).optional(),
      ok: z.boolean(),
      error: z.string().max(2000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    let events = asEvents(parsed.data.events ?? []);
    if (events.length === 0) {
      const runs = await listPipelineHistory(parsed.data.romanId, 40);
      const run = runs.find((r) => r.id === parsed.data.runId);
      events = run?.events ?? [];
    }
    const result = await pipelineStepFinish({
      romanId: parsed.data.romanId,
      runId: parsed.data.runId,
      events,
      ok: parsed.data.ok,
      error: parsed.data.error,
    });
    revalidateBook(parsed.data.romanId);
    return stepResult(result);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pipeline-Abschluss fehlgeschlagen.",
    };
  }
}

export async function loadRomanPipelineHistoryAction(
  input: unknown,
): Promise<ActionResult<{ runs: PipelineHistoryRun[] }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const runs = await listPipelineHistory(
      parsed.data.romanId,
      parsed.data.limit ?? 40,
    );
    return { success: true, data: { runs } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Historie laden fehlgeschlagen.",
    };
  }
}

/**
 * Deletes one KI-Historie run for a book.
 */
export async function deleteRomanPipelineHistoryAction(
  input: unknown,
): Promise<ActionResult<{ deletedId: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid(),
      runId: z.string().uuid(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    // Ensure the run belongs to this book before delete.
    const runs = await listPipelineHistory(parsed.data.romanId, 100);
    const run = runs.find((r) => r.id === parsed.data.runId);
    if (!run) {
      return { success: false, error: "Historie-Eintrag nicht gefunden." };
    }
    await deletePipelineHistoryRun(parsed.data.runId);
    revalidateBook(parsed.data.romanId);
    return { success: true, data: { deletedId: parsed.data.runId } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Historie löschen fehlgeschlagen.",
    };
  }
}

export async function loadRomanPipelineAufgabenAction(): Promise<
  ActionResult<{ aufgaben: RomanPipelineAufgabe[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const aufgaben = await loadPipelineAufgaben({ mergeFallback: true });
    return { success: true, data: { aufgaben } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Aufgaben laden fehlgeschlagen.",
    };
  }
}

export async function saveRomanPipelineAufgabeAction(
  input: unknown,
): Promise<ActionResult<{ aufgabe: RomanPipelineAufgabe }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = aufgabeSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    await savePipelineAufgabe(parsed.data);
    const aufgaben = await loadPipelineAufgaben({ mergeFallback: true });
    const aufgabe = aufgaben.find((a) => a.taskKey === parsed.data.taskKey);
    if (!aufgabe) {
      return {
        success: false,
        error: "Aufgabe nach dem Speichern nicht gefunden.",
      };
    }
    revalidateRomanAdminRollen();
    return { success: true, data: { aufgabe } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Aufgabe speichern fehlgeschlagen.",
    };
  }
}

/**
 * Analyze one Reifegrad dimension (Lektor → plan stored for dialog).
 * Does not weave yet — use romanPipelineDimensionApplyAction.
 */
export async function romanPipelineDimensionAnalyzeAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    plan: import("@/lib/roman/editorial").RomanReifegradImprovePlan;
    summary: string;
    runId: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      dimension: dimensionSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const blocked = await denyCleverManuskriptReifegrad(
      parsed.data.romanId,
      parsed.data.stage,
    );
    if (blocked) return { success: false, error: blocked };
    const {
      analyzeReifegradDimension,
      isReifegradDimensionForStage,
    } = await import("@/lib/roman/reifegrad-dimension");
    if (
      !isReifegradDimensionForStage(parsed.data.stage, parsed.data.dimension)
    ) {
      return {
        success: false,
        error: `Dimension „${parsed.data.dimension}“ passt nicht zur Stufe ${parsed.data.stage}.`,
      };
    }
    const data = await analyzeReifegradDimension(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Dimensions-Analyse fehlgeschlagen.",
    };
  }
}

/**
 * Apply stored Reifegrad-dimension plan (Co-Autor → re-score).
 */
export async function romanPipelineDimensionApplyAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    summary: string;
    runId: string;
    patchedChapters: number[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      dimension: dimensionSchema,
      autorEntscheidungen: z
        .record(z.string(), z.string().max(4_000))
        .optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const blocked = await denyCleverManuskriptReifegrad(
      parsed.data.romanId,
      parsed.data.stage,
    );
    if (blocked) return { success: false, error: blocked };
    const { applyReifegradDimensionPlan } = await import(
      "@/lib/roman/reifegrad-dimension"
    );
    const autorEntscheidungen = parsed.data.autorEntscheidungen
      ? Object.fromEntries(
          Object.entries(parsed.data.autorEntscheidungen).map(([k, v]) => [
            Number(k),
            v,
          ]),
        )
      : undefined;
    const data = await applyReifegradDimensionPlan({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      dimension: parsed.data.dimension,
      autorEntscheidungen,
    });
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Dimensions-Einarbeiten fehlgeschlagen.",
    };
  }
}

/** Discard one open Reifegrad-dimension plan (siblings stay). */
export async function romanPipelineDimensionDiscardAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    summary: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      dimension: dimensionSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const {
      discardReifegradDimensionPlan,
      isReifegradDimensionForStage,
    } = await import("@/lib/roman/reifegrad-dimension");
    if (
      !isReifegradDimensionForStage(parsed.data.stage, parsed.data.dimension)
    ) {
      return {
        success: false,
        error: `Dimension „${parsed.data.dimension}“ passt nicht zur Stufe ${parsed.data.stage}.`,
      };
    }
    const data = await discardReifegradDimensionPlan(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Plan verwerfen fehlgeschlagen.",
    };
  }
}

/**
 * Stage Verbessern analyze (Lektor → plan for dialog). No weave yet.
 */
export async function romanPipelineStageVerbessernAnalyzeAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    plan: import("@/lib/roman/editorial").RomanReifegradImprovePlan;
    summary: string;
    runId: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const blocked = await denyCleverManuskriptReifegrad(
      parsed.data.romanId,
      parsed.data.stage,
    );
    if (blocked) return { success: false, error: blocked };
    const { analyzeStageVerbessern } = await import(
      "@/lib/roman/stage-verbessern"
    );
    const data = await analyzeStageVerbessern(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verbessern-Analyse fehlgeschlagen.",
    };
  }
}

/**
 * Apply stored stage Verbessern plan (Co-Autor → re-score).
 */
export async function romanPipelineStageVerbessernApplyAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    summary: string;
    runId: string;
    patchedChapters: number[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      autorEntscheidungen: z
        .record(z.string(), z.string().max(4_000))
        .optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const blocked = await denyCleverManuskriptReifegrad(
      parsed.data.romanId,
      parsed.data.stage,
    );
    if (blocked) return { success: false, error: blocked };
    const { applyStageVerbessern } = await import(
      "@/lib/roman/stage-verbessern"
    );
    const autorEntscheidungen = parsed.data.autorEntscheidungen
      ? Object.fromEntries(
          Object.entries(parsed.data.autorEntscheidungen).map(([k, v]) => [
            Number(k),
            v,
          ]),
        )
      : undefined;
    const data = await applyStageVerbessern({
      romanId: parsed.data.romanId,
      stage: parsed.data.stage,
      autorEntscheidungen,
    });
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verbessern-Einarbeiten fehlgeschlagen.",
    };
  }
}

/** Discard open stage Verbessern plan. */
export async function romanPipelineStageVerbessernDiscardAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    summary: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const { discardStageVerbessern } = await import(
      "@/lib/roman/stage-verbessern"
    );
    const data = await discardStageVerbessern(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Plan verwerfen fehlgeschlagen.",
    };
  }
}

/**
 * @deprecated Prefer analyze + apply. One-shot Lektor → Co-Autor → re-score.
 */
export async function romanPipelineDimensionImproveAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: import("@/lib/roman/types").RomanKontext;
    critique: string;
    summary: string;
    runId: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      stage: stageSchema,
      dimension: dimensionSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const blocked = await denyCleverManuskriptReifegrad(
      parsed.data.romanId,
      parsed.data.stage,
    );
    if (blocked) return { success: false, error: blocked };
    const {
      improveReifegradDimension,
      isReifegradDimensionForStage,
    } = await import("@/lib/roman/reifegrad-dimension");
    if (
      !isReifegradDimensionForStage(parsed.data.stage, parsed.data.dimension)
    ) {
      return {
        success: false,
        error: `Dimension „${parsed.data.dimension}“ passt nicht zur Stufe ${parsed.data.stage}.`,
      };
    }
    const data = await improveReifegradDimension(parsed.data);
    revalidateBook(parsed.data.romanId);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Dimensions-Verbessern fehlgeschlagen.",
    };
  }
}
