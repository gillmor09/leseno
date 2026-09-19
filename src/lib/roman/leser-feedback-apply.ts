/**
 * Apply stored Testleser feedback into Idee / Spec / Kapitelgerüst / Manuskript.
 *
 * Manuskript + Kapitelgerüst: chapter batches from `aenderungsPrompts`.
 * Spec: same brief onto Charaktere, Welt und Exposé.
 * Idee: Co-Autor weaves into ideeKurz.
 * After weave: Reifegrad neu bewerten (wie Dimensions-Einarbeiten).
 */

import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import {
  emptyRomanEditorial,
  formatLeserFeedbackPatchBrief,
  leserFeedbackForStage,
  missingAutorEntscheidungen,
  onlyNiceToHavePrompts,
  actionableAenderungsPrompts,
  resolveLeserFeedbackApplyChapters,
  withLeserFeedbackForStage,
  type LeserFeedbackStage,
  type RomanLeserFeedback,
} from "@/lib/roman/editorial";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import { PIPELINE_STAGE_LABELS } from "@/lib/roman/pipeline/stages";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import {
  assessStageReifegrad,
  editorialWithReifegrad,
  formatAssessCoverageLabel,
} from "@/lib/roman/reifegrad";
import { formatCraftScoresLine } from "@/lib/roman/reifegrad-craft";
import { upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";

/** Max chapters per applyRouteTarget call (matches apply.ts MAX_CHAPTER_PATCHES). */
const FEEDBACK_APPLY_BATCH = 24;

/** Spec = combined brief → patch all three Spec surfaces. */
const SPEC_APPLY_STAGES: PipelineStage[] = ["charaktere", "welt", "expose"];

/**
 * Weave last Leser-Feedback into a stage (keeps feedback stored, sets appliedAt).
 * Optional `autorEntscheidungen` keyed by index in `feedback.aenderungsPrompts`
 * (human-in-the-loop forks from Testleser).
 */
export async function applyLeserFeedbackToStage(input: {
  roman: RomanKontext;
  stage: LeserFeedbackStage;
  feedback?: RomanLeserFeedback | null;
  autorEntscheidungen?: Record<number, string>;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
}> {
  const stage = input.stage;
  const stageLabel =
    stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[stage];
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const feedback =
    input.feedback ?? leserFeedbackForStage(editorial, stage);
  if (!feedback) {
    throw new Error("Kein gespeichertes Leser-Feedback.");
  }
  if (onlyNiceToHavePrompts(feedback.aenderungsPrompts)) {
    throw new Error(
      "Nur noch Nice-to-have — keine Pflichtpunkte zum Einarbeiten. Neues Feedback holen oder so belassen.",
    );
  }
  if (actionableAenderungsPrompts(feedback.aenderungsPrompts).length === 0) {
    throw new Error(
      "Im Feedback fehlen verpflichtende Änderungsaufträge. Bitte „Neues Feedback“ holen.",
    );
  }

  const missingDecisions = missingAutorEntscheidungen(
    feedback.aenderungsPrompts,
    input.autorEntscheidungen,
  );
  if (missingDecisions.length > 0) {
    throw new Error(
      `Bitte zuerst entscheiden: ${missingDecisions.join(", ")}.`,
    );
  }
  const autorEntscheidungen = input.autorEntscheidungen ?? {};
  const briefOpts = { autorEntscheidungen };

  if (stage === "manuskript") {
    const text = editorial.manuskriptText ?? "";
    if (!text.trim()) {
      throw new Error("Zuerst ein Manuskript anlegen.");
    }
    return applyChapterStage({
      roman: input.roman,
      stage: "manuskript",
      stageLabel,
      feedback,
      chapterDoc: text,
      briefOpts,
    });
  }

  if (stage === "szenenplot") {
    const plot = input.roman.manuskriptRaw ?? "";
    if (!plot.trim()) {
      throw new Error("Zuerst ein Kapitelgerüst anlegen.");
    }
    return applyChapterStage({
      roman: input.roman,
      stage: "szenenplot",
      stageLabel,
      feedback,
      chapterDoc: plot,
      briefOpts,
    });
  }

  if (stage === "idee") {
    return applyIdeeStage({
      roman: input.roman,
      feedback,
      stageLabel,
      briefOpts,
    });
  }

  return applySpecStage({
    roman: input.roman,
    feedback,
    stageLabel,
    briefOpts,
  });
}

/** @deprecated Prefer {@link applyLeserFeedbackToStage}. */
export async function applyLeserFeedbackToManuskript(input: {
  roman: RomanKontext;
  feedback?: RomanLeserFeedback | null;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
}> {
  return applyLeserFeedbackToStage({
    roman: input.roman,
    stage: "manuskript",
    feedback: input.feedback,
  });
}

async function applyChapterStage(input: {
  roman: RomanKontext;
  stage: "manuskript" | "szenenplot";
  stageLabel: string;
  feedback: RomanLeserFeedback;
  chapterDoc: string;
  briefOpts: { autorEntscheidungen: Record<number, string> };
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
}> {
  const { stage, stageLabel, feedback, chapterDoc, briefOpts } = input;
  const plan = resolveLeserFeedbackApplyChapters(chapterDoc, feedback);
  if (plan.chapterNumbers.length === 0) {
    throw new Error(
      "Im Feedback fehlen Änderungsaufträge mit Kapitel-Scope. Bitte „Neues Feedback“ holen (aenderungsPrompts mit scope lokal/buchweit).",
    );
  }

  const scopeLabel = plan.bookWide
    ? `buchweit · ${plan.chapterNumbers.length} Kapitel${
        plan.localChapters.length
          ? ` (inkl. lokal Kap. ${plan.localChapters.join(", ")})`
          : ""
      }`
    : `gezielt Kap. ${plan.chapterNumbers.join(", ")}`;

  const briefBase = { stage, ...briefOpts };
  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.roman.id,
    trigger: "leser_feedback_apply",
    originStage: stage,
    firstEvent: historyEvent({
      type: "info",
      stage,
      summary: `Feedback einarbeiten · ${stageLabel} · ${scopeLabel}`,
      detail: formatLeserFeedbackPatchBrief(feedback, briefBase).slice(0, 4_000),
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage,
      summary: `Feedback einarbeiten · ${stageLabel} · ${scopeLabel}`,
      detail: formatLeserFeedbackPatchBrief(feedback, briefBase).slice(0, 4_000),
    }),
  );

  try {
    let roman = input.roman;
    const allPatched: number[] = [];
    const batches: number[][] = [];
    for (let i = 0; i < plan.chapterNumbers.length; i += FEEDBACK_APPLY_BATCH) {
      batches.push(plan.chapterNumbers.slice(i, i + FEEDBACK_APPLY_BATCH));
    }

    for (let bi = 0; bi < batches.length; bi += 1) {
      const chapterNumbers = batches[bi]!;
      if (batches.length > 1) {
        events.push(
          historyEvent({
            type: "info",
            stage,
            summary: `Batch ${bi + 1}/${batches.length}: Kap. ${chapterNumbers.join(", ")}`,
          }),
        );
        await updatePipelineHistoryRun({
          runId,
          status: "running",
          events,
        });
      }

      const { result: applied, usage } = await runWithAiUsageCollector(() =>
        applyRouteTarget({
          roman,
          critiqueText: feedback.gesamt,
          target: {
            stage,
            reason: plan.bookWide
              ? `Leser-Feedback (${stageLabel}): buchweite + lokale Vorschläge einarbeiten`
              : `Leser-Feedback (${stageLabel}): gezielte Kapitel aus Stellen einarbeiten`,
            patchBrief: formatLeserFeedbackPatchBrief(feedback, briefBase),
            chapterNumbers,
          },
          patchBriefForChapter: (n) =>
            formatLeserFeedbackPatchBrief(feedback, {
              ...briefBase,
              chapterNumber: n,
            }),
        }),
      );

      roman = applied.roman;
      const patched = applied.patchedChapters ?? [];
      allPatched.push(...patched);
      events.push(
        historyEvent({
          type: "apply",
          stage,
          roleKey: "co_autor",
          summary: applied.summary,
          detail: `Batch Kap. ${chapterNumbers.join(", ")}`,
          usage,
        }),
      );
    }

    const uniquePatched = [...new Set(allPatched)].sort((a, b) => a - b);
    if (uniquePatched.length === 0) {
      const message =
        "Co-Autor hat keine Kapitel geändert — Feedback wurde nicht eingearbeitet. Bitte erneut versuchen.";
      events.push(
        historyEvent({
          type: "error",
          stage,
          summary: message,
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "error", events });
      throw new Error(message);
    }

    const saved = await persistAppliedFeedback(roman, stage, feedback);
    const finished = await finishWithReifegrad({
      roman: { ...saved, ideenChat: roman.ideenChat },
      stage,
      stageLabel,
      events,
      runId,
      focusChapterNumbers: uniquePatched,
      changeSummary: `Leser-Feedback eingearbeitet · Kap. ${uniquePatched.join(", ")}`,
      baseSummary: `Feedback eingearbeitet (${stageLabel} · ${scopeLabel}) · geändert Kap. ${uniquePatched.join(", ")}`,
    });

    return {
      roman: finished.roman,
      summary: finished.summary,
      patchedChapters: uniquePatched,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Einarbeiten des Leser-Feedbacks fehlgeschlagen.";
    if (!events.some((e) => e.type === "error" && e.summary === message)) {
      events.push(
        historyEvent({
          type: "error",
          stage,
          summary: message,
        }),
      );
    }
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

async function applyIdeeStage(input: {
  roman: RomanKontext;
  feedback: RomanLeserFeedback;
  stageLabel: string;
  briefOpts: { autorEntscheidungen: Record<number, string> };
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
}> {
  const { feedback, stageLabel, briefOpts } = input;
  const ideeKurz = (input.roman.editorial?.ideeKurz ?? "").trim();
  if (ideeKurz.length < 40) {
    throw new Error("Zuerst eine Ideendokumentation anlegen.");
  }
  const patchBrief = formatLeserFeedbackPatchBrief(feedback, {
    stage: "idee",
    ...briefOpts,
  });
  const hasLegacy = feedback.vorschlaege.some((v) => v.text.trim());
  if (!feedback.aenderungsPrompts.length && !hasLegacy) {
    throw new Error(
      "Im Feedback fehlen Änderungsaufträge. Bitte „Neues Feedback“ holen.",
    );
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.roman.id,
    trigger: "leser_feedback_apply",
    originStage: "idee",
    firstEvent: historyEvent({
      type: "info",
      stage: "idee",
      summary: `Feedback einarbeiten · ${stageLabel}`,
      detail: patchBrief.slice(0, 4_000),
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: "idee",
      summary: `Feedback einarbeiten · ${stageLabel}`,
      detail: patchBrief.slice(0, 4_000),
    }),
  );

  try {
    const { result: applied, usage } = await runWithAiUsageCollector(() =>
      applyRouteTarget({
        roman: input.roman,
        critiqueText: feedback.gesamt,
        target: {
          stage: "idee",
          reason: `Leser-Feedback (${stageLabel}) einarbeiten`,
          patchBrief,
        },
      }),
    );

    events.push(
      historyEvent({
        type: "apply",
        stage: "idee",
        roleKey: "co_autor",
        summary: applied.summary,
        usage,
      }),
    );

    const saved = await persistAppliedFeedback(
      applied.roman,
      "idee",
      feedback,
    );
    const finished = await finishWithReifegrad({
      roman: { ...saved, ideenChat: applied.roman.ideenChat },
      stage: "idee",
      stageLabel,
      events,
      runId,
      changeSummary: "Leser-Feedback in Idee eingearbeitet",
      baseSummary: `Feedback eingearbeitet (${stageLabel}): ${applied.summary}`,
    });

    return {
      roman: finished.roman,
      summary: finished.summary,
      patchedChapters: [],
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Einarbeiten des Leser-Feedbacks fehlgeschlagen.";
    if (!events.some((e) => e.type === "error" && e.summary === message)) {
      events.push(
        historyEvent({
          type: "error",
          stage: "idee",
          summary: message,
        }),
      );
    }
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

async function applySpecStage(input: {
  roman: RomanKontext;
  feedback: RomanLeserFeedback;
  stageLabel: string;
  briefOpts: { autorEntscheidungen: Record<number, string> };
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
}> {
  const { feedback, stageLabel, briefOpts } = input;
  const patchBrief = formatLeserFeedbackPatchBrief(feedback, {
    stage: "expose",
    ...briefOpts,
  });
  if (!patchBrief.trim() || !feedback.aenderungsPrompts.length) {
    // Still allow legacy vorschlaege via formatLeserFeedbackPatchBrief
    const hasLegacy = feedback.vorschlaege.some((v) => v.text.trim());
    if (!hasLegacy && feedback.aenderungsPrompts.length === 0) {
      throw new Error(
        "Im Feedback fehlen Änderungsaufträge. Bitte „Neues Feedback“ holen.",
      );
    }
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.roman.id,
    trigger: "leser_feedback_apply",
    originStage: "expose",
    firstEvent: historyEvent({
      type: "info",
      stage: "expose",
      summary: `Feedback einarbeiten · ${stageLabel}`,
      detail: patchBrief.slice(0, 4_000),
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: "expose",
      summary: `Feedback einarbeiten · ${stageLabel}`,
      detail: patchBrief.slice(0, 4_000),
    }),
  );

  try {
    let roman = input.roman;
    const summaries: string[] = [];

    for (const applyStage of SPEC_APPLY_STAGES) {
      const { result: applied, usage } = await runWithAiUsageCollector(() =>
        applyRouteTarget({
          roman,
          critiqueText: feedback.gesamt,
          target: {
            stage: applyStage,
            reason: `Leser-Feedback (${stageLabel}) → ${PIPELINE_STAGE_LABELS[applyStage]}`,
            patchBrief,
          },
        }),
      );
      roman = applied.roman;
      summaries.push(applied.summary);
      events.push(
        historyEvent({
          type: "apply",
          stage: applyStage,
          roleKey: "co_autor",
          summary: applied.summary,
          usage,
        }),
      );
    }

    const saved = await persistAppliedFeedback(roman, "expose", feedback);
    const finished = await finishWithReifegrad({
      roman: { ...saved, ideenChat: roman.ideenChat },
      stage: "expose",
      stageLabel,
      events,
      runId,
      changeSummary: "Leser-Feedback in Spec (Figuren/Welt/Exposé) eingearbeitet",
      baseSummary: `Feedback eingearbeitet (${stageLabel}): ${summaries.join(" · ")}`,
    });

    return {
      roman: finished.roman,
      summary: finished.summary,
      patchedChapters: [],
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Einarbeiten des Leser-Feedbacks fehlgeschlagen.";
    if (!events.some((e) => e.type === "error" && e.summary === message)) {
      events.push(
        historyEvent({
          type: "error",
          stage: "expose",
          summary: message,
        }),
      );
    }
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

async function persistAppliedFeedback(
  roman: RomanKontext,
  stage: LeserFeedbackStage,
  feedback: RomanLeserFeedback,
): Promise<RomanKontext> {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const current = leserFeedbackForStage(ed, stage) ?? feedback;
  const marked = withLeserFeedbackForStage(ed, stage, {
    ...current,
    appliedAt: new Date().toISOString(),
  });
  return upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: marked,
  });
}

/**
 * Re-score stage Reifegrad after Feedback weave (fail-soft like dimensions).
 */
async function finishWithReifegrad(input: {
  roman: RomanKontext;
  stage: LeserFeedbackStage;
  stageLabel: string;
  events: PipelineHistoryEvent[];
  runId: string;
  focusChapterNumbers?: number[];
  changeSummary: string;
  baseSummary: string;
}): Promise<{ roman: RomanKontext; summary: string }> {
  const previous =
    input.roman.editorial?.reifegrade?.[input.stage] ?? null;
  try {
    const { result: assessed, usage: reifeUsage } =
      await runWithAiUsageCollector(() =>
        assessStageReifegrad({
          roman: input.roman,
          stage: input.stage,
          focusChapterNumbers: input.focusChapterNumbers,
          previous,
          changeSummary: input.changeSummary,
        }),
      );
    const nextEd = editorialWithReifegrad(
      input.roman.editorial ?? emptyRomanEditorial(),
      input.stage,
      assessed.score,
    );
    const saved = await upsertRomanKontext({
      id: input.roman.id,
      title: input.roman.title,
      manuskriptRaw: input.roman.manuskriptRaw,
      stilbibel: input.roman.stilbibel,
      genre: input.roman.genre,
      praemisse: input.roman.praemisse,
      perspektive: input.roman.perspektive,
      zeitform: input.roman.zeitform,
      tonalitaet: input.roman.tonalitaet,
      charaktere: input.roman.charaktere,
      weltSchauplaetze: input.roman.weltSchauplaetze,
      weltRegeln: input.roman.weltRegeln,
      szenenRaster: input.roman.szenenRaster,
      kiRegelwerk: input.roman.kiRegelwerk,
      fanPersonaName: input.roman.fanPersonaName,
      fanPersonaProfil: input.roman.fanPersonaProfil,
      editorial: nextEd,
    });
    const score = assessed.score;
    const coverageLabel = formatAssessCoverageLabel(assessed.coverage);
    const delta =
      previous != null ? score.gesamtPct - previous.gesamtPct : null;
    const deltaLabel =
      delta == null
        ? ""
        : delta === 0
          ? " · Δ 0"
          : ` · Δ ${delta > 0 ? "+" : ""}${delta}`;
    input.events.push(
      historyEvent({
        type: "info",
        stage: input.stage,
        modelLabel: score.modelLabel,
        summary: `Reifegrad nach Leser-Feedback: ${score.gesamtPct}%${deltaLabel} · ${coverageLabel} (Logik ${score.regelnPct}% · ${formatCraftScoresLine(input.stage, score)})`,
        usage: reifeUsage,
      }),
    );
    await updatePipelineHistoryRun({
      runId: input.runId,
      status: "ok",
      events: input.events,
    });
    return {
      roman: { ...saved, ideenChat: input.roman.ideenChat },
      summary: `${input.baseSummary} · Reifegrad jetzt ${score.gesamtPct}% · ${coverageLabel}.`,
    };
  } catch (assessError) {
    input.events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary:
          assessError instanceof Error
            ? `Reifegrad-Bewertung fehlgeschlagen: ${assessError.message}`
            : "Reifegrad-Bewertung fehlgeschlagen.",
      }),
    );
    await updatePipelineHistoryRun({
      runId: input.runId,
      status: "ok",
      events: input.events,
    });
    return {
      roman: input.roman,
      summary: `${input.baseSummary} · Reifegrad konnte nicht neu gemessen werden.`,
    };
  }
}
