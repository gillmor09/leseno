/**
 * Reifegrad-dimension improve: analyze (Lektor → plan + dialog) then apply
 * (Co-Autor from aenderungsPrompts → re-score). Same two-step pattern as
 * Leser-Feedback.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import {
  ROMAN_ALTER_PRESETS,
  buildCritiqueRulesAndNeedsBlock,
  emptyRomanEditorial,
  findAlterPresetId,
  formatReifegradImprovePatchBrief,
  onlyNiceToHavePrompts,
  actionableAenderungsPrompts,
  missingAutorEntscheidungen,
  parseAenderungsPrompts,
  parseRomanReifegradImprovePlan,
  replaceReifegradImproveStageWithApplied,
  discardReifegradImprovePlan,
  resolveReifegradImproveChapters,
  reifegradImprovePlansForStage,
  upsertReifegradImprovePlan,
  type RomanAenderungsPrompt,
  type RomanReifegradImprovePlan,
} from "@/lib/roman/editorial";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { ROMAN_CRITIQUE_FOCUS_MANDATE } from "@/lib/roman/pipeline/quality-brief";
import {
  findDimensionDef,
  formatCraftScoresLine,
  REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG,
  type ReifegradDimension,
} from "@/lib/roman/reifegrad-craft";
import {
  assessStageReifegrad,
  editorialWithReifegrad,
  formatAssessCoverageLabel,
  getStageArtifactText,
} from "@/lib/roman/reifegrad";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/**
 * Spec (stage `expose`) dimensions map onto the three Spec parts for apply.
 * Logik may touch all three when contradictions span the brief.
 */
function applyStagesForDimension(
  stage: PipelineStage,
  dimension: string,
): PipelineStage[] {
  if (stage !== "expose") return [stage];
  const key = dimension === "regeln" ? "logik" : dimension;
  switch (key) {
    case "figurenkraft":
      return ["charaktere"];
    case "weltnutzen":
      return ["welt"];
    case "handlungsbogen":
      return ["expose"];
    case "logik":
      return ["charaktere", "welt", "expose"];
    default:
      return ["expose"];
  }
}

export type {
  ReifegradCraftKey,
  ReifegradCraftSlot,
  ReifegradCoreDimension,
  ReifegradDimension,
  ReifegradDimensionDef,
} from "@/lib/roman/reifegrad-craft";
export {
  ALL_REIFEGRAD_DIMENSION_KEYS,
  REIFEGRAD_CORE_DEFS,
  REIFEGRAD_CORE_DIMENSIONS,
  REIFEGRAD_DIMENSION_LABELS,
  STAGE_CRAFT_DIMENSIONS,
  craftDimensionsForStage,
  dimensionLabel,
  dimensionsForStage,
  findDimensionDef,
  formatCraftScoresLine,
  improveDimensionsForStage,
  isReifegradDimensionForStage,
  pctForDimension,
  statusForDimension,
} from "@/lib/roman/reifegrad-craft";

const FEEDBACK_APPLY_BATCH = 24;

function altergruppeLabel(
  editorial: ReturnType<typeof emptyRomanEditorial>,
): string {
  const presetId = findAlterPresetId(editorial);
  const preset = ROMAN_ALTER_PRESETS.find((p) => p.id === presetId);
  if (preset?.label) return preset.label;
  const min = editorial.zielAlterMin;
  const max = editorial.zielAlterMax;
  if (min != null && max != null) return `${min}–${max} Jahre`;
  if (min != null) return `ab ${min} Jahren`;
  return "(Altersklasse nicht gesetzt)";
}

async function persistEditorial(
  roman: RomanKontext,
  editorial: NonNullable<RomanKontext["editorial"]>,
): Promise<RomanKontext> {
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
    editorial,
  });
  return { ...saved, ideenChat: roman.ideenChat };
}

/** Parse aenderungsPrompts from model JSON. */
function parsePrompts(raw: unknown): RomanAenderungsPrompt[] {
  return parseAenderungsPrompts(raw);
}

function parseDimensionAnalyzeRaw(
  raw: string,
  meta: {
    stage: PipelineStage;
    dimension: ReifegradDimension;
    dimensionLabel: string;
    modelLabel: string;
  },
): RomanReifegradImprovePlan {
  const obj = parseModelJsonObject(raw, "Dimensions-Analyse");

  let kritik = String(
    obj.kritik ?? obj.critique ?? obj.leserFeedback ?? "",
  ).trim();
  let prompts = parsePrompts(obj.aenderungsPrompts);
  if (prompts.length === 0) {
    const brief = String(
      obj.patchBrief ?? obj.patch_brief ?? obj.brief ?? "",
    ).trim();
    if (brief.length >= 20) {
      const chapters = Array.isArray(obj.chapterNumbers)
        ? obj.chapterNumbers
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)
            .map((n) => Math.round(n))
            .slice(0, 24)
        : [];
      prompts = [
        {
          titel: "Nacharbeit",
          scope: chapters.length > 0 ? "lokal" : "buchweit",
          kapitel: chapters,
          anweisung: brief.slice(0, 4_000),
          wichtigkeit: "wichtig",
        },
      ];
    }
  }

  // Short kritik + empty / only-nice prompts are valid — never fail the analyze.
  if (!kritik) {
    kritik =
      prompts.length === 0
        ? "Keine Pflichtpunkte mehr — diese Dimension wirkt in Ordnung."
        : onlyNiceToHavePrompts(prompts)
          ? "Nur noch Nice-to-have — keine harten Pflichtpunkte."
          : "Kurzanalyse.";
  }

  const plan = parseRomanReifegradImprovePlan(
    {
      ...obj,
      kritik,
      aenderungsPrompts: prompts,
      stage: meta.stage,
      dimension: meta.dimension,
      dimensionLabel: meta.dimensionLabel,
      modelLabel: meta.modelLabel,
      createdAt: new Date().toISOString(),
    },
    meta.stage,
  );
  if (!plan) {
    // Last resort: always return a calm empty plan rather than erroring.
    return {
      createdAt: new Date().toISOString(),
      stage: meta.stage,
      dimension: meta.dimension,
      dimensionLabel: meta.dimensionLabel,
      modelLabel: meta.modelLabel,
      kritik,
      aenderungsPrompts: prompts,
      appliedAt: null,
    };
  }
  return plan;
}

/**
 * Entwicklungslektor: analyze one dimension → structured plan (no weave yet).
 */
export async function analyzeReifegradDimension(input: {
  romanId: string;
  stage: PipelineStage;
  dimension: ReifegradDimension;
}): Promise<{
  roman: RomanKontext;
  plan: RomanReifegradImprovePlan;
  summary: string;
  runId: string;
}> {
  const def = findDimensionDef(input.stage, input.dimension);
  if (!def) {
    throw new Error(
      `Dimension „${input.dimension}“ gilt nicht für Stufe ${input.stage}.`,
    );
  }
  const dimLabel = def.label;
  const stageLabel = PIPELINE_STAGE_LABELS[input.stage];
  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.romanId,
    trigger: "dimension_analyze",
    originStage: input.stage,
    firstEvent: historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Dimensions-Analyse: ${dimLabel} · ${stageLabel}`,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Dimensions-Analyse: ${dimLabel} · ${stageLabel}`,
    }),
  );

  try {
    const loaded = await getRomanKontext(input.romanId);
    if (!loaded) throw new Error("Buch nicht gefunden.");
    let roman = loaded;
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const compliance = buildCritiqueRulesAndNeedsBlock(editorial);
    const artifact = getStageArtifactText(roman, input.stage);
    const alter = altergruppeLabel(editorial);
    const chapterStages =
      input.stage === "szenenplot" || input.stage === "manuskript";

    const { rolle } = await resolveRomanKiRolle("entwicklungslektor");
    const analyzeBase = await resolveRomanSchreibModel(
      REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG,
    );
    const model: AiModelConfig = {
      ...analyzeBase,
      reasoningEffort: resolveReasoningEffort(
        REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG,
        rolle.reasoningEffort,
      ),
    };

    const userText = `${compliance}

# Altersklasse
${alter}
lesestufe: ${editorial.lesestufe?.trim() || "—"}

# Stufe
${stageLabel} (${input.stage})${
  input.stage === "expose"
    ? "\nSpec = Charaktere + Welt + Exposé als ein Brief (Artefakt unten)."
    : ""
}

# Dimension (EINZIGER Fokus — alles andere ignorieren)
${def.label}
${def.brief}

# Artefakt
${artifact}

Auftrag:
Analysiere knallhart NUR diese Dimension. Liefere ZWEI Schichten:
1) kritik — Prosa zum Lesen (konkrete Schwächen mit Belegen). Darf kurz sein, wenn wenig fehlt.
2) aenderungsPrompts — maximal 3 ausführbare Co-Autor-Aufträge (WO + WAS), die wichtigsten zuerst.
   Leer [] ist OK, wenn nichts kritisch/wichtig fehlt. Nur nice_to_have, wenn wirklich nur Feinschliff übrig ist.

Antwort NUR als JSON:
{
  "kritik": "Absatz eins. Absatz zwei. (kritische Analyse nur zu ${def.label}; Absätze als \\\\n\\\\n escapen — oder ein kurzer Satz, wenn alles passt)",
  "aenderungsPrompts": [
    {
      "titel": "kurzer Name",
      "wichtigkeit": "kritisch"|"wichtig"|"nice_to_have",
      "scope": "${chapterStages ? "lokal" : "buchweit"}",
      "kapitel": ${chapterStages ? "[3]" : "[]"},
      "anweisung": "Imperativ: was genau ändern — nur diese Dimension",
      "entscheidungNoetig": false,
      "entscheidungFrage": ""
    }
  ]
}

Regeln:
- kritik: Lesetext, keine Patch-Anweisungen. Wenn Schwächen: 2–4 kurze Absätze. Wenn wenig/nichts: 1–2 ruhige Sätze reichen — KEIN Fehler, kein Zwang zu Pseudo-Kritik.
- aenderungsPrompts: max. 3; titel, wichtigkeit, scope, anweisung Pflicht. Leeres Array erlaubt, wenn keine Pflichtpunkte.
- wichtigkeit: kritisch (bricht Logik/Versprechen), wichtig (spürbarer Mangel), nice_to_have nur wenn nichts Härteres übrig.
- Kein Nice-to-have / Feinschliff, solange kritisch oder wichtig existiert.
- Wenn der Autor zwischen Varianten wählen MUSS (Entweder/Oder, offene Canon-Frage): setze entscheidungNoetig=true und entscheidungFrage als kurze, klare Frage. In anweisung die Alternativen und Folgeschritte beschreiben — KEINE Variante selbst wählen.
- Bei Szenenplot/Manuskript: scope „lokal“ mit kapitel, oder „buchweit“ für Kontinuität über alle Kapitel.
- Bei anderen Stufen: meist scope „buchweit“, kapitel [].
- Spec (expose): Aufträge dürfen Figuren, Welt oder Exposé betreffen — klar benennen WO.
- Nur diese Dimension. Kein Umschreiben des Artefakts hier. Nur valides JSON.`;

    const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_FOCUS_MANDATE}

Zusatzauftrag Dimensions-Analyse (${def.label} · ${stageLabel}):
Du bist Entwicklungslektor:in. Fokus ausschließlich auf ${def.label}.
Zwei Schichten: kritik (Prosa, darf kurz sein) + aenderungsPrompts (0–3, mit wichtigkeit).
Offene Autor-Entscheidungen als entscheidungNoetig markieren — nicht selbst entscheiden.
Wenn die Dimension schon trägt: kurze Bestätigung + leere aenderungsPrompts — kein erfundener Mangel. Nur JSON.`;

    const { result: plan, usage } = await runWithAiUsageCollector(async () => {
      const raw = await generateText({
        model,
        systemInstruction: system,
        userText,
        preferJson: true,
        maxTokens: 4_000,
        timeoutMs: 90_000,
      });
      return parseDimensionAnalyzeRaw(raw, {
        stage: input.stage,
        dimension: input.dimension,
        dimensionLabel: dimLabel,
        modelLabel: model.label,
      });
    });

    events.push(
      historyEvent({
        type: "critique",
        stage: input.stage,
        roleKey: "entwicklungslektor",
        modelLabel: plan.modelLabel,
        summary: `Analyse · ${dimLabel} · ${plan.aenderungsPrompts.length} Aufträge`,
        detail: `${plan.kritik.slice(0, 3_000)}\n\n---\n${plan.aenderungsPrompts
          .map((p) => `[${p.scope}] ${p.titel}: ${p.anweisung}`)
          .join("\n")
          .slice(0, 3_000)}`,
        critiqueText: plan.kritik,
        usage,
      }),
    );

    const nextEd = {
      ...editorial,
      reifegradImprove: upsertReifegradImprovePlan(
        editorial.reifegradImprove,
        input.stage,
        plan,
      ),
    };
    roman = await persistEditorial(roman, nextEd);
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    const actionable = actionableAenderungsPrompts(plan.aenderungsPrompts);
    const summary =
      actionable.length > 0
        ? `${dimLabel} analysiert · ${actionable.length} Pflichtauftrag/aufträge — Einarbeiten im Dialog.`
        : onlyNiceToHavePrompts(plan.aenderungsPrompts)
          ? `${dimLabel} analysiert · nur Nice-to-have — so belassen.`
          : `${dimLabel} analysiert · keine Pflichtpunkte — so belassen.`;

    return {
      roman,
      plan,
      summary,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Dimensions-Analyse fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Apply stored Reifegrad-improve plan for one dimension (Co-Autor → re-score).
 * Clears sibling open plans on this stage after a successful weave.
 */
export async function applyReifegradDimensionPlan(input: {
  romanId: string;
  stage: PipelineStage;
  dimension: ReifegradDimension;
  /** Author answers keyed by index in plan.aenderungsPrompts. */
  autorEntscheidungen?: Record<number, string>;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  runId: string;
  patchedChapters: number[];
}> {
  const stageLabel = PIPELINE_STAGE_LABELS[input.stage];
  const events: PipelineHistoryEvent[] = [];
  const loaded = await getRomanKontext(input.romanId);
  if (!loaded) throw new Error("Buch nicht gefunden.");

  const editorial = loaded.editorial ?? emptyRomanEditorial();
  const plan =
    reifegradImprovePlansForStage(editorial.reifegradImprove, input.stage)[
      input.dimension
    ] ?? null;
  if (!plan) {
    throw new Error(
      "Keine Dimensions-Analyse gespeichert — zuerst „Analysieren“.",
    );
  }
  const dimLabel = plan.dimensionLabel;
  if (onlyNiceToHavePrompts(plan.aenderungsPrompts)) {
    return {
      roman: loaded,
      summary: `${dimLabel} · nur Nice-to-have — nichts einzuarbeiten.`,
      runId: "",
      patchedChapters: [],
    };
  }
  if (actionableAenderungsPrompts(plan.aenderungsPrompts).length === 0) {
    return {
      roman: loaded,
      summary: `${dimLabel} · keine Pflichtpunkte — nichts einzuarbeiten.`,
      runId: "",
      patchedChapters: [],
    };
  }
  const missingDecisions = missingAutorEntscheidungen(
    plan.aenderungsPrompts,
    input.autorEntscheidungen,
  );
  if (missingDecisions.length > 0) {
    throw new Error(
      `Bitte zuerst entscheiden: ${missingDecisions.join(", ")}.`,
    );
  }
  const autorEntscheidungen = input.autorEntscheidungen ?? {};
  const briefOpts = { autorEntscheidungen };

  const runId = await startPipelineHistoryRun({
    romanId: input.romanId,
    trigger: "dimension_apply",
    originStage: input.stage,
    firstEvent: historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Dimensions-Einarbeiten: ${dimLabel} · ${stageLabel}`,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Dimensions-Einarbeiten: ${dimLabel} · ${stageLabel}`,
      detail: formatReifegradImprovePatchBrief(plan, briefOpts).slice(0, 4_000),
    }),
  );

  try {
    let roman = loaded;
    const allPatched: number[] = [];
    const chapterDoc =
      input.stage === "manuskript"
        ? (editorial.manuskriptText ?? "")
        : input.stage === "szenenplot"
          ? (roman.manuskriptRaw ?? "")
          : "";

    if (input.stage === "manuskript" || input.stage === "szenenplot") {
      const chapterPlan = resolveReifegradImproveChapters(chapterDoc, plan);
      if (chapterPlan.chapterNumbers.length === 0) {
        throw new Error(
          "Keine Kapitel für die Änderungsaufträge gefunden (scope/kapitel prüfen).",
        );
      }
      const batches: number[][] = [];
      for (
        let i = 0;
        i < chapterPlan.chapterNumbers.length;
        i += FEEDBACK_APPLY_BATCH
      ) {
        batches.push(
          chapterPlan.chapterNumbers.slice(i, i + FEEDBACK_APPLY_BATCH),
        );
      }
      for (const chapterNumbers of batches) {
        const { result: applied, usage } = await runWithAiUsageCollector(() =>
          applyRouteTarget({
            roman,
            critiqueText: plan.kritik,
            target: {
              stage: input.stage,
              reason: `Fokussierte Nacharbeit: ${dimLabel}`,
              patchBrief: formatReifegradImprovePatchBrief(plan, briefOpts),
              chapterNumbers,
            },
            patchBriefForChapter: (n) =>
              formatReifegradImprovePatchBrief(plan, {
                ...briefOpts,
                chapterNumber: n,
              }),
          }),
        );
        roman = applied.roman;
        allPatched.push(...(applied.patchedChapters ?? []));
        events.push(
          historyEvent({
            type: "apply",
            stage: input.stage,
            roleKey: "co_autor",
            summary: applied.summary,
            usage,
          }),
        );
      }
    } else {
      const applyStages = applyStagesForDimension(
        input.stage,
        plan.dimension,
      );
      for (const applyStage of applyStages) {
        const { result: applied, usage } = await runWithAiUsageCollector(() =>
          applyRouteTarget({
            roman,
            critiqueText: plan.kritik,
            target: {
              stage: applyStage,
              reason: `Fokussierte Nacharbeit: ${dimLabel} → ${PIPELINE_STAGE_LABELS[applyStage]}`,
              patchBrief: formatReifegradImprovePatchBrief(plan, briefOpts),
            },
          }),
        );
        roman = applied.roman;
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
    }

    const uniquePatched = [...new Set(allPatched)].sort((a, b) => a - b);
    const ed = roman.editorial ?? emptyRomanEditorial();
    const markedPlan: RomanReifegradImprovePlan = {
      ...plan,
      appliedAt: new Date().toISOString(),
    };
    let nextEd = {
      ...ed,
      reifegradImprove: replaceReifegradImproveStageWithApplied(
        ed.reifegradImprove,
        input.stage,
        markedPlan,
      ),
    };

    const previous = nextEd.reifegrade?.[input.stage] ?? null;
    try {
      const { result: assessed, usage: reifeUsage } =
        await runWithAiUsageCollector(() =>
          assessStageReifegrad({
            roman: { ...roman, editorial: nextEd },
            stage: input.stage,
            focusChapterNumbers: uniquePatched,
            previous,
            changeSummary: `Dimension ${dimLabel} eingearbeitet`,
          }),
        );
      nextEd = editorialWithReifegrad(nextEd, input.stage, assessed.score);
      roman = await persistEditorial(roman, nextEd);
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
      events.push(
        historyEvent({
          type: "info",
          stage: input.stage,
          modelLabel: score.modelLabel,
          summary: `Reifegrad nach ${dimLabel}: ${score.gesamtPct}%${deltaLabel} · ${coverageLabel} (Logik ${score.regelnPct}% · ${formatCraftScoresLine(input.stage, score)})`,
          usage: reifeUsage,
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "ok", events });
      return {
        roman,
        summary: `${dimLabel} eingearbeitet · Reifegrad jetzt ${score.gesamtPct}% · ${coverageLabel}`,
        runId,
        patchedChapters: uniquePatched,
      };
    } catch (assessError) {
      roman = await persistEditorial(roman, nextEd);
      events.push(
        historyEvent({
          type: "error",
          stage: input.stage,
          summary:
            assessError instanceof Error
              ? `Reifegrad-Bewertung fehlgeschlagen: ${assessError.message}`
              : "Reifegrad-Bewertung fehlgeschlagen.",
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "ok", events });
      return {
        roman,
        summary: `${dimLabel} eingearbeitet · Reifegrad konnte nicht neu gemessen werden`,
        runId,
        patchedChapters: uniquePatched,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Dimensions-Einarbeiten fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: input.stage,
        summary: message,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Discard one open dimension plan (no weave). Sibling plans stay.
 */
export async function discardReifegradDimensionPlan(input: {
  romanId: string;
  stage: PipelineStage;
  dimension: ReifegradDimension;
}): Promise<{
  roman: RomanKontext;
  summary: string;
}> {
  const def = findDimensionDef(input.stage, input.dimension);
  const dimLabel = def?.label ?? input.dimension;
  const loaded = await getRomanKontext(input.romanId);
  if (!loaded) throw new Error("Buch nicht gefunden.");

  const editorial = loaded.editorial ?? emptyRomanEditorial();
  const existing =
    reifegradImprovePlansForStage(editorial.reifegradImprove, input.stage)[
      input.dimension
    ] ?? null;
  if (!existing) {
    return {
      roman: loaded,
      summary: `${dimLabel}: kein offener Plan.`,
    };
  }

  const nextEd = {
    ...editorial,
    reifegradImprove: discardReifegradImprovePlan(
      editorial.reifegradImprove,
      input.stage,
      input.dimension,
    ),
  };
  const roman = await persistEditorial(loaded, nextEd);
  return {
    roman,
    summary: `Plan „${dimLabel}“ verworfen.`,
  };
}

/**
 * @deprecated Prefer analyze + apply. One-shot for compatibility.
 */
export async function improveReifegradDimension(input: {
  romanId: string;
  stage: PipelineStage;
  dimension: ReifegradDimension;
}): Promise<{
  roman: RomanKontext;
  critique: string;
  summary: string;
  runId: string;
}> {
  const analyzed = await analyzeReifegradDimension(input);
  const applied = await applyReifegradDimensionPlan({
    romanId: input.romanId,
    stage: input.stage,
    dimension: input.dimension,
  });
  return {
    roman: applied.roman,
    critique: analyzed.plan.kritik,
    summary: applied.summary,
    runId: applied.runId,
  };
}

export type { RomanAenderungsPrompt, RomanReifegradImprovePlan };
