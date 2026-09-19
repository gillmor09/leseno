/**
 * Stage-wide Verbessern: Entwicklungslektor analyze (max 3 + HITL) → dialog →
 * Co-Autor apply → Reifegrad. Same two-step pattern as Dimension / Leser-Feedback.
 * Spec (`expose`) weaves Charaktere + Welt + Exposé.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import {
  ROMAN_ALTER_PRESETS,
  STAGE_VERBESSERN_DIMENSION,
  buildCritiqueRulesAndNeedsBlock,
  emptyRomanEditorial,
  findAlterPresetId,
  formatReifegradImprovePatchBrief,
  onlyNiceToHavePrompts,
  actionableAenderungsPrompts,
  missingAutorEntscheidungen,
  parseAenderungsPrompts,
  parseRomanReifegradImprovePlan,
  resolveReifegradImproveChapters,
  stageImproveForStage,
  withStageImprove,
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
  formatCraftScoresLine,
  REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG,
} from "@/lib/roman/reifegrad-craft";
import {
  assessStageReifegrad,
  editorialWithReifegrad,
  formatAssessCoverageLabel,
  getStageArtifactText,
} from "@/lib/roman/reifegrad";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanKontext } from "@/lib/roman/types";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/** Max chapters per applyRouteTarget call. */
const FEEDBACK_APPLY_BATCH = 24;

/** Spec Verbessern patches all three Spec surfaces. */
const SPEC_APPLY_STAGES: PipelineStage[] = ["charaktere", "welt", "expose"];

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

function parseStageVerbessernRaw(
  raw: string,
  meta: {
    stage: PipelineStage;
    modelLabel: string;
  },
): RomanReifegradImprovePlan {
  const obj = parseModelJsonObject(raw, "Verbessern-Analyse");

  let kritik = String(
    obj.kritik ?? obj.critique ?? obj.leserFeedback ?? "",
  ).trim();
  let prompts = parseAenderungsPrompts(obj.aenderungsPrompts);
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

  if (!kritik) {
    kritik =
      prompts.length === 0
        ? "Keine Pflichtpunkte mehr — dieser Schritt wirkt in Ordnung."
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
      dimension: STAGE_VERBESSERN_DIMENSION,
      dimensionLabel: "Gesamt",
      modelLabel: meta.modelLabel,
      createdAt: new Date().toISOString(),
    },
    meta.stage,
  );
  if (!plan) {
    return {
      createdAt: new Date().toISOString(),
      stage: meta.stage,
      dimension: STAGE_VERBESSERN_DIMENSION,
      dimensionLabel: "Gesamt",
      modelLabel: meta.modelLabel,
      kritik,
      aenderungsPrompts: prompts,
      appliedAt: null,
    };
  }
  return plan;
}

/**
 * Entwicklungslektor: whole-stage Verbessern analyze → structured plan (no weave).
 */
export async function analyzeStageVerbessern(input: {
  romanId: string;
  stage: PipelineStage;
}): Promise<{
  roman: RomanKontext;
  plan: RomanReifegradImprovePlan;
  summary: string;
  runId: string;
}> {
  const stageLabel =
    input.stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[input.stage];
  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.romanId,
    trigger: "stage_verbessern_analyze",
    originStage: input.stage,
    firstEvent: historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Verbessern-Analyse · ${stageLabel}`,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Verbessern-Analyse · ${stageLabel}`,
    }),
  );

  try {
    const loaded = await getRomanOrThrow(input.romanId);
    let roman = loaded;
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const compliance = buildCritiqueRulesAndNeedsBlock(editorial);
    const artifact = getStageArtifactText(roman, input.stage);
    if (!artifact.trim()) {
      throw new Error(
        `Zuerst ${stageLabel} anlegen — sonst gibt es nichts zu verbessern.`,
      );
    }
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

# Artefakt
${artifact}

Auftrag:
Analysiere knallhart DIESE Stufe als Ganzes. Liefere ZWEI Schichten:
1) kritik — Prosa zum Lesen (die 1–3 kritischsten Schwächen mit Belegen). Darf kurz sein, wenn wenig fehlt.
2) aenderungsPrompts — maximal 3 ausführbare Co-Autor-Aufträge (WO + WAS), Wichtigkeit zuerst.
   Leer [] ist OK, wenn nichts kritisch/wichtig fehlt. Nur nice_to_have, wenn wirklich nur Feinschliff übrig ist.

Antwort NUR als JSON:
{
  "kritik": "Absatz eins. Absatz zwei. (kritische Analyse; Absätze als \\\\n\\\\n escapen — oder ein kurzer Satz, wenn alles passt)",
  "aenderungsPrompts": [
    {
      "titel": "kurzer Name",
      "wichtigkeit": "kritisch"|"wichtig"|"nice_to_have",
      "scope": "${chapterStages ? "lokal" : "buchweit"}",
      "kapitel": ${chapterStages ? "[3]" : "[]"},
      "anweisung": "Imperativ: was genau ändern",
      "entscheidungNoetig": false,
      "entscheidungFrage": ""
    }
  ]
}

Regeln:
- kritik: Lesetext, keine Patch-Anweisungen. Wenn Schwächen: 2–4 kurze Absätze. Wenn wenig/nichts: 1–2 ruhige Sätze — KEIN Zwang zu Pseudo-Kritik.
- aenderungsPrompts: max. 3; titel, wichtigkeit, scope, anweisung Pflicht. Leeres Array erlaubt.
- wichtigkeit: kritisch (bricht Logik/Versprechen), wichtig (spürbarer Mangel), nice_to_have nur wenn nichts Härteres übrig.
- Kein Nice-to-have / Feinschliff, solange kritisch oder wichtig existiert.
- Wenn der Autor zwischen Varianten wählen MUSS (Entweder/Oder, offene Canon-Frage): setze entscheidungNoetig=true und entscheidungFrage als kurze Frage. In anweisung die Alternativen — KEINE Variante selbst wählen.
- Bei Szenenplot/Manuskript: scope „lokal“ mit kapitel, oder „buchweit“.
- Bei anderen Stufen: meist scope „buchweit“, kapitel [].
- Spec (expose): Aufträge dürfen Figuren, Welt oder Exposé betreffen — klar benennen WO.
- Nur diese Stufe. Kein Umschreiben hier. Nur valides JSON.`;

    const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_FOCUS_MANDATE}

Zusatzauftrag Verbessern-Analyse (${stageLabel}):
Du bist Entwicklungslektor:in. Fokus auf die gesamte Stufe.
Zwei Schichten: kritik (Prosa) + aenderungsPrompts (0–3, mit wichtigkeit).
Offene Autor-Entscheidungen als entscheidungNoetig markieren — nicht selbst entscheiden.
Wenn die Stufe schon trägt: kurze Bestätigung + leere aenderungsPrompts. Nur JSON.`;

    const { result: plan, usage } = await runWithAiUsageCollector(async () => {
      const raw = await generateText({
        model,
        systemInstruction: system,
        userText,
        preferJson: true,
        maxTokens: 4_000,
        timeoutMs: 90_000,
      });
      return parseStageVerbessernRaw(raw, {
        stage: input.stage,
        modelLabel: model.label,
      });
    });

    events.push(
      historyEvent({
        type: "critique",
        stage: input.stage,
        roleKey: "entwicklungslektor",
        modelLabel: plan.modelLabel,
        summary: `Verbessern · ${plan.aenderungsPrompts.length} Aufträge`,
        detail: `${plan.kritik.slice(0, 3_000)}\n\n---\n${plan.aenderungsPrompts
          .map((p) => `[${p.scope}] ${p.titel}: ${p.anweisung}`)
          .join("\n")
          .slice(0, 3_000)}`,
        critiqueText: plan.kritik,
        usage,
      }),
    );

    const nextEd = withStageImprove(editorial, input.stage, plan);
    roman = await persistEditorial(roman, nextEd);
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    const actionable = actionableAenderungsPrompts(plan.aenderungsPrompts);
    const summary =
      actionable.length > 0
        ? `${stageLabel} analysiert · ${actionable.length} Pflichtauftrag/aufträge — Einarbeiten im Dialog.`
        : onlyNiceToHavePrompts(plan.aenderungsPrompts)
          ? `${stageLabel} analysiert · nur Nice-to-have — so belassen.`
          : `${stageLabel} analysiert · keine Pflichtpunkte — so belassen.`;

    return { roman, plan, summary, runId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Verbessern-Analyse fehlgeschlagen.";
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
 * Apply stored stage Verbessern plan (Co-Autor → re-score).
 */
export async function applyStageVerbessern(input: {
  romanId: string;
  stage: PipelineStage;
  autorEntscheidungen?: Record<number, string>;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  runId: string;
  patchedChapters: number[];
}> {
  const stageLabel =
    input.stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[input.stage];
  const events: PipelineHistoryEvent[] = [];
  const loaded = await getRomanOrThrow(input.romanId);

  const editorial = loaded.editorial ?? emptyRomanEditorial();
  const plan = stageImproveForStage(editorial, input.stage);
  if (!plan) {
    throw new Error(
      "Keine Verbessern-Analyse gespeichert — zuerst „Verbessern“.",
    );
  }
  if (onlyNiceToHavePrompts(plan.aenderungsPrompts)) {
    return {
      roman: loaded,
      summary: `${stageLabel} · nur Nice-to-have — nichts einzuarbeiten.`,
      runId: "",
      patchedChapters: [],
    };
  }
  if (actionableAenderungsPrompts(plan.aenderungsPrompts).length === 0) {
    return {
      roman: loaded,
      summary: `${stageLabel} · keine Pflichtpunkte — nichts einzuarbeiten.`,
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
    trigger: "stage_verbessern_apply",
    originStage: input.stage,
    firstEvent: historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Verbessern einarbeiten · ${stageLabel}`,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Verbessern einarbeiten · ${stageLabel}`,
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
              reason: `Verbessern · ${stageLabel}`,
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
      const applyStages =
        input.stage === "expose" ? SPEC_APPLY_STAGES : [input.stage];
      for (const applyStage of applyStages) {
        const { result: applied, usage } = await runWithAiUsageCollector(() =>
          applyRouteTarget({
            roman,
            critiqueText: plan.kritik,
            target: {
              stage: applyStage,
              reason: `Verbessern · ${stageLabel} → ${PIPELINE_STAGE_LABELS[applyStage]}`,
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
    let nextEd = withStageImprove(ed, input.stage, markedPlan);

    const previous = nextEd.reifegrade?.[input.stage] ?? null;
    try {
      const { result: assessed, usage: reifeUsage } =
        await runWithAiUsageCollector(() =>
          assessStageReifegrad({
            roman: { ...roman, editorial: nextEd },
            stage: input.stage,
            focusChapterNumbers: uniquePatched,
            previous,
            changeSummary: `Verbessern · ${stageLabel} eingearbeitet`,
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
          summary: `Reifegrad nach Verbessern: ${score.gesamtPct}%${deltaLabel} · ${coverageLabel} (Logik ${score.regelnPct}% · ${formatCraftScoresLine(input.stage, score)})`,
          usage: reifeUsage,
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "ok", events });
      return {
        roman,
        summary: `${stageLabel} verbessert · Reifegrad jetzt ${score.gesamtPct}% · ${coverageLabel}`,
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
        summary: `${stageLabel} verbessert · Reifegrad konnte nicht neu gemessen werden`,
        runId,
        patchedChapters: uniquePatched,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Verbessern-Einarbeiten fehlgeschlagen.";
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

/** Discard open Verbessern plan (no weave). */
export async function discardStageVerbessern(input: {
  romanId: string;
  stage: PipelineStage;
}): Promise<{ roman: RomanKontext; summary: string }> {
  const stageLabel =
    input.stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[input.stage];
  const loaded = await getRomanOrThrow(input.romanId);
  const editorial = loaded.editorial ?? emptyRomanEditorial();
  if (!stageImproveForStage(editorial, input.stage)) {
    return {
      roman: loaded,
      summary: `${stageLabel}: kein offener Verbessern-Plan.`,
    };
  }
  const nextEd = withStageImprove(editorial, input.stage, null);
  const roman = await persistEditorial(loaded, nextEd);
  return {
    roman,
    summary: `Verbessern-Plan für ${stageLabel} verworfen.`,
  };
}

async function getRomanOrThrow(romanId: string): Promise<RomanKontext> {
  const { getRomanKontext } = await import("@/lib/roman/repository");
  const loaded = await getRomanKontext(romanId);
  if (!loaded) throw new Error("Buch nicht gefunden.");
  return loaded;
}

export type { RomanReifegradImprovePlan };
