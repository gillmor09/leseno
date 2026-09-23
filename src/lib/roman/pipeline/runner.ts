/**
 * Stage pipeline orchestrator (no vertical cascade).
 * Erzeugen: draft → Reifegrad.
 * Verbessern: critique → apply on this stage only → Reifegrad.
 * Upstream/downstream stages are never auto-patched or cleared.
 */

import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  formatCritiqueForPrompt,
  type CritiquePayload,
  type RouteTarget,
} from "@/lib/roman/pipeline/critique-schema";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
  type PipelineHistoryTrigger,
} from "@/lib/roman/pipeline/history";
import { critiqueStage, draftStage } from "@/lib/roman/pipeline/producers";
import {
  PIPELINE_STAGE_LABELS,
  cleverManuskriptSkipsReifegrad,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { emptyRomanEditorial, countWords } from "@/lib/roman/editorial";
import {
  MANUSKRIPT_BOOK_WORD_FLOOR_PCT,
  formatManuskriptWordMetrics,
  manuskriptBookAtOrOverCeiling,
  manuskriptBookNearOrOverTarget,
  manuskriptChapterWordCount,
  manuskriptChaptersUnderMin,
  manuskriptWordsPerChapter,
} from "@/lib/roman/manuskript-contracts";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import {
  assessStageReifegrad,
  editorialWithReifegrad,
  formatAssessCoverageLabel,
} from "@/lib/roman/reifegrad";
import { formatCraftScoresLine } from "@/lib/roman/reifegrad-craft";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";

export type PipelineRunResult = {
  roman: RomanKontext;
  runId: string;
  status: "ok" | "error";
  events: PipelineHistoryEvent[];
  error?: string;
};

export type PipelineStepResult = {
  roman: RomanKontext;
  runId: string;
  events: PipelineHistoryEvent[];
  critique?: CritiquePayload;
  critiqueText?: string;
  status: "running" | "ok" | "error";
  error?: string;
  /** German label for the wait dialog (what just finished / next hint). */
  progressLabel: string;
};

async function reload(romanId: string): Promise<RomanKontext> {
  // Cover bytes stay in the DB; the client keeps the image it already has.
  // Shipping them back after a long draft blows the response stream.
  const roman = await getRomanKontext(romanId, { omitCover: true });
  if (!roman) throw new Error("Buch nicht gefunden.");
  return roman;
}

async function appendEvents(input: {
  runId: string;
  events: PipelineHistoryEvent[];
  status?: string;
}): Promise<void> {
  await updatePipelineHistoryRun({
    runId: input.runId,
    status: input.status ?? "running",
    events: input.events,
  });
}

/**
 * Full generate path (server-side monolith). Prefer step actions for UI progress.
 */
export async function runPipelineGenerate(input: {
  romanId: string;
  stage: PipelineStage;
}): Promise<PipelineRunResult> {
  return runPipelineMonolith({
    romanId: input.romanId,
    stage: input.stage,
    trigger: "auto_generate",
    includeDraft: true,
  });
}

/**
 * Manual critique path (server-side monolith).
 */
export async function runPipelineCritique(input: {
  romanId: string;
  stage: PipelineStage;
}): Promise<PipelineRunResult> {
  return runPipelineMonolith({
    romanId: input.romanId,
    stage: input.stage,
    trigger: "manual_critique",
    includeDraft: false,
  });
}

async function runPipelineMonolith(input: {
  romanId: string;
  stage: PipelineStage;
  trigger: PipelineHistoryTrigger;
  includeDraft: boolean;
}): Promise<PipelineRunResult> {
  let runId = "";
  let events: PipelineHistoryEvent[] = [];
  let roman = await reload(input.romanId);
  let critique: CritiquePayload | undefined;
  let critiqueText: string | undefined;

  try {
    const started = await pipelineStepStart({
      romanId: input.romanId,
      stage: input.stage,
      trigger: input.trigger,
      includeDraft: input.includeDraft,
    });
    runId = started.runId;
    events = started.events;
    roman = started.roman;

    // Erzeugen: draft + Reifegrad only (no Gegenlese / Verbessern).
    if (input.includeDraft) {
      const drafted = await pipelineStepDraft({
        romanId: input.romanId,
        stage: input.stage,
        runId,
        events,
      });
      events = drafted.events;
      roman = drafted.roman;
      if (drafted.status === "error") {
        return {
          roman,
          runId,
          status: "error",
          events,
          error: drafted.error,
        };
      }

      const assessed = await pipelineStepAssessReifegrad({
        romanId: input.romanId,
        stage: input.stage,
        runId,
        events,
        changeSummary: `Frischer Entwurf von ${PIPELINE_STAGE_LABELS[input.stage]}.`,
      });
      events = assessed.events;
      roman = assessed.roman;
      if (assessed.status === "error") {
        return {
          roman,
          runId,
          status: "error",
          events,
          error: assessed.error,
        };
      }

      const finished = await pipelineStepFinish({
        romanId: input.romanId,
        runId,
        events,
        ok: true,
      });
      return {
        roman: finished.roman,
        runId,
        status: "ok",
        events: finished.events,
      };
    }

    const critiqued = await pipelineStepCritique({
      romanId: input.romanId,
      stage: input.stage,
      runId,
      events,
    });
    events = critiqued.events;
    roman = critiqued.roman;
    critique = critiqued.critique;
    critiqueText = critiqued.critiqueText;
    if (critiqued.status === "error" || !critique || !critiqueText) {
      return {
        roman,
        runId,
        status: "error",
        events,
        error: critiqued.error ?? "Gegenlese fehlgeschlagen.",
      };
    }

    const cascaded = await pipelineStepCascade({
      romanId: input.romanId,
      originStage: input.stage,
      runId,
      events,
      critique,
      critiqueText,
    });
    events = cascaded.events;
    roman = cascaded.roman;
    if (cascaded.status === "error") {
      return {
        roman,
        runId,
        status: "error",
        events,
        error: cascaded.error,
      };
    }

    const finished = await pipelineStepFinish({
      romanId: input.romanId,
      runId,
      events,
      ok: true,
    });
    return {
      roman: finished.roman,
      runId,
      status: "ok",
      events: finished.events,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Pipeline-Lauf fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    if (runId) {
      try {
        await appendEvents({ runId, events, status: "error" });
      } catch {
        /* ignore */
      }
    }
    try {
      roman = await reload(input.romanId);
    } catch {
      /* keep */
    }
    return { roman, runId, status: "error", events, error: message };
  }
}

/** Start a history run (no LLM). */
export async function pipelineStepStart(input: {
  romanId: string;
  stage: PipelineStage;
  trigger: PipelineHistoryTrigger;
  includeDraft: boolean;
  critiqueOnly?: boolean;
}): Promise<PipelineStepResult> {
  const roman = await reload(input.romanId);
  const label = PIPELINE_STAGE_LABELS[input.stage];
  const summary = input.includeDraft
    ? `Erzeugen: ${label}`
    : input.critiqueOnly
      ? `Gegenlesen: ${label}`
      : `Verbessern: ${label}`;
  const first = historyEvent({
    type: "info",
    stage: input.stage,
    summary,
  });
  const runId = await startPipelineHistoryRun({
    romanId: input.romanId,
    trigger: input.trigger,
    originStage: input.stage,
    firstEvent: first,
  });
  return {
    roman,
    runId,
    events: [first],
    status: "running",
    progressLabel: input.includeDraft
      ? `Erzeugen: ${label} …`
      : input.critiqueOnly
        ? `Gegenlesen: ${label} …`
        : `Verbessern: ${label} …`,
  };
}

/**
 * Spec Erzeugen: Charaktere → Welt → Exposé in one run, then clear Kapitelgerüst/Manuskript.
 * No per-stage Reifegrad — quality is judged primarily on the Manuskript.
 */
export async function pipelineStepDraftSpec(input: {
  romanId: string;
  runId: string;
  events: PipelineHistoryEvent[];
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  const stages: PipelineStage[] = ["charaktere", "welt", "expose"];
  try {
    let roman = await reload(input.romanId);
    for (const stage of stages) {
      const { result, usage } = await runWithAiUsageCollector(() =>
        draftStage(roman, stage),
      );
      roman = result.roman;
      events.push(
        historyEvent({
          type: "draft",
          stage,
          modelLabel: result.modelLabel,
          summary: result.summary,
          usage,
        }),
      );
    }

    await appendEvents({ runId: input.runId, events });
    return {
      roman,
      runId: input.runId,
      events,
      status: "running",
      progressLabel: "Spec fertig — Abschluss …",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Spec-Entwurf fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: "expose",
        summary: message,
      }),
    );
    await appendEvents({ runId: input.runId, events, status: "error" });
    let roman: RomanKontext;
    try {
      roman = await reload(input.romanId);
    } catch {
      throw error instanceof Error ? error : new Error(message);
    }
    return {
      roman,
      runId: input.runId,
      events,
      status: "error",
      error: message,
      progressLabel: "Fehler beim Spec-Entwurf",
    };
  }
}

/** Draft one stage (later stages stay untouched). */
export async function pipelineStepDraft(input: {
  romanId: string;
  stage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
  /** Optional live callback (tests / local hooks); history DB is the poll source. */
  onLiveProgress?: (label: string) => void;
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  const LIVE_PROGRESS = "live-progress";
  let lastProgressWriteAt = 0;

  async function reportProgress(label: string, force = false) {
    input.onLiveProgress?.(label);
    const next = events.filter((e) => e.detail !== LIVE_PROGRESS);
    next.push(
      historyEvent({
        type: "info",
        stage: input.stage,
        summary: label,
        detail: LIVE_PROGRESS,
      }),
    );
    events.length = 0;
    events.push(...next);
    const now = Date.now();
    // Always persist chapter completion so the wait dialog advances even under throttle.
    const forceWrite =
      force || /:\s*fertig\b/i.test(label) || /Schreibbrief fertig/i.test(label);
    // Throttle DB writes so polling works without hammering history on every sub-step.
    if (!forceWrite && now - lastProgressWriteAt < 1_200) return;
    lastProgressWriteAt = now;
    await appendEvents({ runId: input.runId, events });
  }

  try {
    let roman = await reload(input.romanId);
    if (input.stage === "manuskript") {
      await reportProgress("Alles erzeugen: Arbeitsbrief vorbereiten …", true);
    }
    const { result, usage } = await runWithAiUsageCollector(() =>
      draftStage(roman, input.stage, {
        onProgress:
          input.stage === "manuskript"
            ? (label) => reportProgress(label)
            : undefined,
      }),
    );
    roman = result.roman;
    // Drop ephemeral live-progress before the permanent draft event.
    const cleaned = events.filter((e) => e.detail !== LIVE_PROGRESS);
    events.length = 0;
    events.push(...cleaned);
    events.push(
      historyEvent({
        type: "draft",
        stage: input.stage,
        modelLabel: result.modelLabel,
        summary: result.summary,
        usage,
      }),
    );

    await appendEvents({ runId: input.runId, events });
    return {
      roman,
      runId: input.runId,
      events,
      status: "running",
      progressLabel: `Reifegrad: ${PIPELINE_STAGE_LABELS[input.stage]} …`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Entwurf fehlgeschlagen.";
    const cleaned = events.filter((e) => e.detail !== LIVE_PROGRESS);
    events.length = 0;
    events.push(...cleaned);
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    await appendEvents({ runId: input.runId, events, status: "error" });
    let roman: RomanKontext;
    try {
      roman = await reload(input.romanId);
    } catch {
      throw error instanceof Error ? error : new Error(message);
    }
    return {
      roman,
      runId: input.runId,
      events,
      status: "error",
      error: message,
      progressLabel: "Fehler beim Entwurf",
    };
  }
}

/**
 * Bewerter re-scores maturity for one stage (no text changes).
 * Used after Erzeugen and after Verbessern weave.
 */
export async function pipelineStepAssessReifegrad(input: {
  romanId: string;
  stage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
  focusChapterNumbers?: number[];
  changeSummary?: string;
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  try {
    let roman = await reload(input.romanId);
    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (cleverManuskriptSkipsReifegrad(editorial.buchTyp, input.stage)) {
      const reifegrade = { ...(editorial.reifegrade ?? {}) };
      delete reifegrade.manuskript;
      const improveMap = { ...(editorial.reifegradImprove ?? {}) };
      delete improveMap.manuskript;
      const stageImprove = { ...(editorial.stageImprove ?? {}) };
      delete stageImprove.manuskript;
      const nextEd = {
        ...editorial,
        reifegrade,
        reifegradImprove: improveMap,
        stageImprove,
      };
      const saved = await upsertRomanKontext({
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
        editorial: nextEd,
      });
      roman = { ...saved, ideenChat: roman.ideenChat };
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          summary:
            "Reifegrad übersprungen (Clever erzählt: unabhängige Kurzgeschichten).",
        }),
      );
      await appendEvents({ runId: input.runId, events });
      return {
        roman,
        runId: input.runId,
        events,
        status: "running",
        progressLabel: "Geschichten gespeichert",
      };
    }
    const previous = editorial.reifegrade?.[input.stage] ?? null;
    const focusChapters = [...(input.focusChapterNumbers ?? [])].sort(
      (a, b) => a - b,
    );
    const changeSummary =
      input.changeSummary ??
      (focusChapters.length > 0
        ? `Kapitel ${focusChapters.join(", ")} wurden gerade eingearbeitet.`
        : `Artefakt von ${PIPELINE_STAGE_LABELS[input.stage]} wurde angepasst.`);

    const { result: assessed, usage: reifeUsage } =
      await runWithAiUsageCollector(() =>
        assessStageReifegrad({
          roman,
          stage: input.stage,
          focusChapterNumbers: focusChapters,
          previous,
          changeSummary,
        }),
      );
    const score = assessed.score;
    const coverageLabel = formatAssessCoverageLabel(assessed.coverage);
    const nextEd = editorialWithReifegrad(
      roman.editorial ?? emptyRomanEditorial(),
      input.stage,
      score,
    );
    const saved = await upsertRomanKontext({
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
      editorial: nextEd,
    });
    roman = { ...saved, ideenChat: roman.ideenChat };
    const delta =
      previous != null ? score.gesamtPct - previous.gesamtPct : null;
    const deltaLabel =
      delta == null
        ? ""
        : delta === 0
          ? " · Δ 0"
          : ` · Δ ${delta > 0 ? "+" : ""}${delta}`;
    events.push(
      historyEvent({
        type: "info",
        stage: input.stage,
        roleKey: "bewerter",
        modelLabel: score.modelLabel,
        summary: `Reifegrad: ${score.gesamtPct}%${deltaLabel} · ${coverageLabel} · Logik ${score.regelnPct}% · ${formatCraftScoresLine(input.stage, score)}`,
        usage: reifeUsage,
      }),
    );
    await appendEvents({ runId: input.runId, events });
    return {
      roman,
      runId: input.runId,
      events,
      status: "running",
      progressLabel: `Reifegrad: ${score.gesamtPct}%`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Reifegrad-Bewertung fehlgeschlagen: ${error.message}`
        : "Reifegrad-Bewertung fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    await appendEvents({ runId: input.runId, events });
    let roman: RomanKontext;
    try {
      roman = await reload(input.romanId);
    } catch {
      throw error instanceof Error ? error : new Error(message);
    }
    return {
      roman,
      runId: input.runId,
      events,
      status: "error",
      error: message,
      progressLabel: "Fehler bei Reifegrad",
    };
  }
}

/** Critique one stage. */
export async function pipelineStepCritique(input: {
  romanId: string;
  stage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  try {
    const roman = await reload(input.romanId);
    const { result, usage } = await runWithAiUsageCollector(() =>
      critiqueStage(roman, input.stage),
    );
    events.push(
      historyEvent({
        type: "critique",
        stage: input.stage,
        roleKey: result.roleKey,
        modelLabel: result.modelLabel,
        summary: `${result.critique.findings.length} Findings`,
        detail: formatCritiqueForPrompt(result.critique).slice(0, 8_000),
        usage,
        critique: result.critique,
        critiqueText: result.critiqueText.slice(0, 50_000),
      }),
    );
    await appendEvents({ runId: input.runId, events });
    return {
      roman,
      runId: input.runId,
      events,
      critique: result.critique,
      critiqueText: result.critiqueText,
      status: "running",
      progressLabel: "Router wählt Upstream-Stufe …",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gegenlese fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    await appendEvents({ runId: input.runId, events, status: "error" });
    const roman = await reload(input.romanId);
    return {
      roman,
      runId: input.runId,
      events,
      status: "error",
      error: message,
      progressLabel: "Fehler bei der Gegenlese",
    };
  }
}

/**
 * Apply Gegenlese on the origin stage only (no upstream router, no chain, no clear).
 */
export async function pipelineStepCascade(input: {
  romanId: string;
  originStage: PipelineStage;
  runId: string;
  events: PipelineHistoryEvent[];
  critique: CritiquePayload;
  critiqueText: string;
  /** Ignored — Verbessern is always local. Kept for action compatibility. */
  localOnly?: boolean;
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  try {
    await applyCritiqueLocally({
      romanId: input.romanId,
      originStage: input.originStage,
      critique: input.critique,
      critiqueText: input.critiqueText,
      events,
      runId: input.runId,
    });
    const roman = await reload(input.romanId);
    return {
      roman,
      runId: input.runId,
      events,
      status: "running",
      progressLabel: "Reifegrad geprüft · Anpassung abgeschlossen …",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Einarbeiten fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.originStage,
        summary: message,
      }),
    );
    await appendEvents({ runId: input.runId, events, status: "error" });
    const roman = await reload(input.romanId);
    return {
      roman,
      runId: input.runId,
      events,
      status: "error",
      error: message,
      progressLabel: "Fehler beim Einarbeiten",
    };
  }
}

/** Mark run finished. */
export async function pipelineStepFinish(input: {
  romanId: string;
  runId: string;
  events: PipelineHistoryEvent[];
  ok: boolean;
  error?: string;
}): Promise<PipelineStepResult> {
  const events = [...input.events];
  if (!input.ok && input.error) {
    events.push(
      historyEvent({
        type: "error",
        summary: input.error,
      }),
    );
  }
  await appendEvents({
    runId: input.runId,
    events,
    status: input.ok ? "ok" : "error",
  });
  const roman = await reload(input.romanId);
  return {
    roman,
    runId: input.runId,
    events,
    status: input.ok ? "ok" : "error",
    error: input.error,
    progressLabel: input.ok ? "Fertig" : "Abgebrochen",
  };
}

/** Verbessern: patch only `originStage`, then re-score Reifegrad. */
async function applyCritiqueLocally(input: {
  romanId: string;
  originStage: PipelineStage;
  critique: CritiquePayload;
  critiqueText: string;
  events: PipelineHistoryEvent[];
  runId: string;
}): Promise<void> {
  const patchedFocus = new Set<number>();

  if (input.originStage === "manuskript") {
    await runManuskriptLengthPass({
      romanId: input.romanId,
      runId: input.runId,
      events: input.events,
      patchedFocus,
    });
  }

  let target = localApplyTarget(
    input.originStage,
    input.critique,
    input.critiqueText,
  );

  if (input.originStage === "manuskript") {
    const edCraft = (await reload(input.romanId)).editorial;
    const bookWords = countWords(edCraft?.manuskriptText ?? "");
    const nearZiel = manuskriptBookNearOrOverTarget(
      bookWords,
      edCraft?.zielWortzahlRoman ?? null,
    );
    target = {
      ...target,
      patchBrief: `${target.patchBrief}

${
  nearZiel
    ? "LÄNGEN-CONTRACT: Buch ist schon am/über Ziel — nicht länger machen. Straffen und verdichten erlaubt; Baseline nicht sinnlos aufblasen."
    : "LÄNGEN-CONTRACT: Kapitel nicht kürzen (Body ≥ 95% der bisherigen Wörter; lieber erweitern)."
}
Leserversprechen (Richtungen) nicht verwässern — Logik und Kontinuität haben Vorrang.`.slice(
        0,
        6_000,
      ),
    };
  }

  input.events.push(
    historyEvent({
      type: "route",
      stage: input.originStage,
      summary: `Einarbeiten · ${PIPELINE_STAGE_LABELS[input.originStage]}`,
      targets: [{ stage: target.stage, reason: target.reason }],
      detail: target.patchBrief.slice(0, 6_000),
    }),
  );
  await appendEvents({ runId: input.runId, events: input.events });

  let roman = await reload(input.romanId);
  const { result: applied, usage: applyUsage } = await runWithAiUsageCollector(
    () =>
      applyRouteTarget({
        roman,
        target,
        critiqueText: input.critiqueText,
      }),
  );
  for (const n of applied.patchedChapters ?? []) patchedFocus.add(n);
  input.events.push(
    historyEvent({
      type: "apply",
      stage: target.stage,
      summary: applied.summary,
      detail: target.reason,
      usage: applyUsage,
    }),
  );
  await appendEvents({ runId: input.runId, events: input.events });

  if (input.originStage === "manuskript") {
    roman = await reload(input.romanId);
    const ed = roman.editorial ?? emptyRomanEditorial();
    const text = ed.manuskriptText ?? "";
    const { min } = manuskriptWordsPerChapter(
      ed.zielWortzahlRoman,
      Math.max(parsePlotChapters(text).length, 1),
      ed.zielWortzahlSzeneMax,
    );
    input.events.push(
      historyEvent({
        type: "info",
        stage: "manuskript",
        summary: formatManuskriptWordMetrics({
          words: countWords(text),
          zielWortzahl: ed.zielWortzahlRoman,
          chaptersUnderMin: manuskriptChaptersUnderMin(text, min),
        }),
      }),
    );
    await appendEvents({ runId: input.runId, events: input.events });
  }

  const focusChapters = [...patchedFocus].sort((a, b) => a - b);
  const assessed = await pipelineStepAssessReifegrad({
    romanId: input.romanId,
    stage: input.originStage,
    runId: input.runId,
    events: input.events,
    focusChapterNumbers: focusChapters,
    changeSummary:
      focusChapters.length > 0
        ? `Kapitel ${focusChapters.join(", ")} wurden gerade eingearbeitet.`
        : `Artefakt von ${PIPELINE_STAGE_LABELS[input.originStage]} wurde angepasst.`,
  });
  input.events.length = 0;
  input.events.push(...assessed.events);
}

/**
 * Verbessern pre-pass: expand chapters only when the book is under Ziel.
 */
async function runManuskriptLengthPass(input: {
  romanId: string;
  runId: string;
  events: PipelineHistoryEvent[];
  patchedFocus: Set<number>;
}): Promise<void> {
  let roman = await reload(input.romanId);
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const text = editorial.manuskriptText ?? "";
  const chapters = parsePlotChapters(text);
  if (chapters.length < 2) return;

  const { min } = manuskriptWordsPerChapter(
    editorial.zielWortzahlRoman,
    chapters.length,
    editorial.zielWortzahlSzeneMax,
  );
  const bookWords = countWords(text);
  const ziel = editorial.zielWortzahlRoman;
  const nearZiel = manuskriptBookNearOrOverTarget(bookWords, ziel);
  const overCeiling = manuskriptBookAtOrOverCeiling(bookWords, ziel);

  if (nearZiel) {
    input.events.push(
      historyEvent({
        type: "info",
        stage: "manuskript",
        summary: overCeiling
          ? `Längen-Pass übersprungen: Buch schon über Soft-Ceiling (${bookWords.toLocaleString("de-DE")} Wörter${ziel != null ? ` / Ziel ${ziel.toLocaleString("de-DE")}` : ""}).`
          : `Längen-Pass übersprungen: Buch nahe/am Ziel (${bookWords.toLocaleString("de-DE")} Wörter${ziel != null ? ` / Ziel ${ziel.toLocaleString("de-DE")}` : ""}).`,
      }),
    );
    await appendEvents({ runId: input.runId, events: input.events });
  } else {
    const short = chapters
      .filter((c) => manuskriptChapterWordCount(c.body) < min)
      .map((c) => c.number);

    if (short.length > 0) {
      input.events.push(
        historyEvent({
          type: "info",
          stage: "manuskript",
          summary: `Längen-Pass: Kapitel ${short.join(", ")} unter ${min} Wörtern.`,
        }),
      );
      await appendEvents({ runId: input.runId, events: input.events });
      try {
        const { result: applied, usage } = await runWithAiUsageCollector(() =>
          applyRouteTarget({
            roman,
            critiqueText: "Längen-Contract",
            target: {
              stage: "manuskript",
              reason:
                "Längen-Contract: Kapitel unter Mindestwortzahl expandieren",
              patchBrief: `EXPANDIEREN ohne Handlung zu streichen. Jedes Kapitel mindestens ${min} Wörter. Nicht kürzen. Dialog/Sinneseindruck/Innenleben ergänzen.`.slice(
                0,
                6_000,
              ),
              chapterNumbers: short,
            },
          }),
        );
        roman = applied.roman;
        for (const n of applied.patchedChapters ?? [])
          input.patchedFocus.add(n);
        input.events.push(
          historyEvent({
            type: "apply",
            stage: "manuskript",
            summary: applied.summary,
            detail: "Längen-Pass",
            usage,
          }),
        );
        await appendEvents({ runId: input.runId, events: input.events });
      } catch (error) {
        input.events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary:
              error instanceof Error
                ? `Längen-Pass übersprungen: ${error.message}`
                : "Längen-Pass übersprungen.",
          }),
        );
        await appendEvents({ runId: input.runId, events: input.events });
      }
    }

    // Book floor: expand shortest chapters if total still low.
    roman = await reload(input.romanId);
    const ed2 = roman.editorial ?? emptyRomanEditorial();
    const text2 = ed2.manuskriptText ?? "";
    const ziel2 = ed2.zielWortzahlRoman;
    const words = countWords(text2);
    if (
      ziel2 != null &&
      ziel2 > 0 &&
      words < Math.round(ziel2 * MANUSKRIPT_BOOK_WORD_FLOOR_PCT) &&
      !manuskriptBookNearOrOverTarget(words, ziel2)
    ) {
      const shortest = parsePlotChapters(text2)
        .map((c) => ({
          number: c.number,
          words: manuskriptChapterWordCount(c.body),
        }))
        .sort((a, b) => a.words - b.words)
        .slice(0, 6)
        .map((c) => c.number);
      if (shortest.length > 0) {
        input.events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Buch-Expand: ${words} < ${Math.round(ziel2 * MANUSKRIPT_BOOK_WORD_FLOOR_PCT)} Wörter — Kap. ${shortest.join(", ")}.`,
          }),
        );
        await appendEvents({ runId: input.runId, events: input.events });
        try {
          const { result: applied, usage } = await runWithAiUsageCollector(
            () =>
              applyRouteTarget({
                roman,
                critiqueText: "Buch-Längen-Contract",
                target: {
                  stage: "manuskript",
                  reason: "Buch-Längen-Contract: kürzeste Kapitel erweitern",
                  patchBrief: `EXPANDIEREN bis das Buch näher an ${ziel2} Wörter kommt. Mindestlänge pro Kapitel ${min}. Nicht kürzen. Nicht über ${Math.round(ziel2 * 1.1)} Wörter hinaus.`.slice(
                    0,
                    6_000,
                  ),
                  chapterNumbers: shortest,
                },
              }),
          );
          roman = applied.roman;
          for (const n of applied.patchedChapters ?? [])
            input.patchedFocus.add(n);
          input.events.push(
            historyEvent({
              type: "apply",
              stage: "manuskript",
              summary: applied.summary,
              detail: "Buch-Expand-Pass",
              usage,
            }),
          );
          await appendEvents({ runId: input.runId, events: input.events });
        } catch (error) {
          input.events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              summary:
                error instanceof Error
                  ? `Buch-Expand übersprungen: ${error.message}`
                  : "Buch-Expand übersprungen.",
            }),
          );
          await appendEvents({ runId: input.runId, events: input.events });
        }
      }
    }
  }

}

/** Single-stage apply target for Verbessern. */
function localApplyTarget(
  originStage: PipelineStage,
  critique: CritiquePayload,
  critiqueText: string,
): RouteTarget {
  const chapters = [
    ...new Set(critique.findings.flatMap((f) => f.chapterNumbers ?? [])),
  ].slice(0, 40);
  const patchBrief =
    formatCritiqueForPrompt(critique).trim().slice(0, 6_000) ||
    critiqueText.trim().slice(0, 4_000);
  return {
    stage: originStage,
    reason: "Nacharbeit nur auf aktuellem Schritt",
    patchBrief:
      patchBrief.length >= 3
        ? patchBrief
        : "Verbessere den aktuellen Schritt anhand der Gegenlese.",
    chapterNumbers: chapters.length > 0 ? chapters : undefined,
  };
}
