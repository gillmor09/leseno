/**
 * Stage-wide Verbessern: Entwicklungslektor analyze (max 3 + HITL) → dialog →
 * apply (Gerüst/Plot: structured JSON patch; Manuskript: Co-Autor) → Reifegrad.
 * Spec (`expose`) weaves Charaktere + Welt + Exposé.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import {
  ROMAN_ALTER_PRESETS,
  STAGE_VERBESSERN_DIMENSION,
  STAGE_VERBESSERN_FOCUS_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  emptyRomanEditorial,
  findAlterPresetId,
  formatReifegradImprovePatchBrief,
  onlyNiceToHavePrompts,
  actionableAenderungsPrompts,
  missingAutorEntscheidungen,
  narrowAenderungsPromptsWithKritikChapters,
  parseAenderungsPrompts,
  parseRomanReifegradImprovePlan,
  resolveReifegradImproveChapters,
  stageImproveForStage,
  withStageImprove,
  type RomanReifegradImprovePlan,
  type StageVerbessernFocus,
} from "@/lib/roman/editorial";

export type { StageVerbessernFocus };
export { STAGE_VERBESSERN_FOCUS_LABELS };
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
  romanApplyRoleKey,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { filterAenderungsPromptsByGrounding } from "@/lib/roman/critique-grounding";
import {
  ROMAN_CRITIQUE_FOCUS_MANDATE,
  ROMAN_CRITIQUE_QUOTE_GROUNDING,
  ROMAN_CRITIQUE_SCOPE_MANDATE,
  highBandLastGapsMandate,
  REIFEGRAD_HIGH_BAND_PP,
  specStageAnalyzePolicy,
  structureStageAnalyzePolicy,
} from "@/lib/roman/pipeline/quality-brief";
import {
  formatReifegradRegressionSummary,
  reifegradGesamtRegressed,
} from "@/lib/roman/improve-apply-guard";
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
import {
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
} from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/** Chapter list for Verbessern scope — prefer structured remirror. */
function improveChapterDoc(
  roman: RomanKontext,
  stage: PipelineStage,
): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  if (stage === "manuskript") return ed.manuskriptText ?? "";
  if (stage === "kapitelgeruest") {
    if (ed.kapitelGeruestStructured?.chapters.length) {
      return structuredKapitelGeruestToMarkdown(ed.kapitelGeruestStructured);
    }
    return ed.kapitelGeruestRaw ?? "";
  }
  if (stage === "szenenplot") {
    if (ed.szenenplotStructured?.chapters.length) {
      return structuredSzenenplotToMarkdown(ed.szenenplotStructured);
    }
    return roman.manuskriptRaw ?? "";
  }
  return "";
}

/** Max chapters per applyRouteTarget call. */
const FEEDBACK_APPLY_BATCH = 24;

/** Spec Verbessern patches all three Spec surfaces. */
const SPEC_APPLY_STAGES: PipelineStage[] = ["charaktere", "welt", "expose"];

function focusAnalyzeAddendum(
  focus: StageVerbessernFocus,
  stage?: PipelineStage,
): string {
  // Spec: early gate — must carry a full novel before Gerüst/Plot invent gaps.
  if (stage === "expose") {
    const specPolicy = specStageAnalyzePolicy(focus);
    if (focus === "logik") {
      return `FOKUS DIESES LAUFS: NUR Spec-Logik (Figuren ↔ Welt ↔ Exposé).
Prüfe Widersprüche, unglaubwürdige Motivation, Canon-Löcher und Plot-Rettungen ohne Spec-Basis.
Ignoriere reine Spannungs-/Stilpolitur — außer sie erzeugen Logikbrüche.
aenderungsPrompts: Logik/Canon reparieren (streichen/ersetzen/verbieten), WO klar (Figuren/Welt/Exposé).${specPolicy}`;
    }
    if (focus === "craft") {
      return `FOKUS DIESES LAUFS: NUR Spec-Craft (Figurenkraft, Weltnutzen, Handlungsbogen).
Prüfe Mehrakt-Stoff, Escalation, Midpoint/Endgame-Seed, konfliktfähige Welt, greifbare Antriebe — reicht das für einen ganzen Roman?
Keine neuen Logistik-Motive. Logik-Löcher nur, wenn der Bogen kollabiert — sonst weglassen (separater Logik-Lauf).
aenderungsPrompts: Spec-Stoff und Bogen nachschärfen, nicht Prosa schreiben.${specPolicy}`;
    }
    return `FOKUS: Spec Gesamt — Logik und Craft gemischt (max. 3, Härteste zuerst).
Vorrang: Lücken, die einen ganzen Roman nicht tragen (zu dünner Stoff, fehlende Escalation, widersprüchlicher Canon).${specPolicy}`;
  }

  // Structured Szenenplot: Logik/Craft map onto contracts, not prose.
  if (stage === "szenenplot") {
    const plotPolicy = structureStageAnalyzePolicy("szenenplot");
    if (focus === "logik") {
      return `FOKUS DIESES LAUFS: NUR Logik der Szenenverträge.
Prüfe: Ursache→Wirkung zwischen Szenen; continuity.character_states_after (Ort/Etage) und prop_placements_after; next_scene_hook-Bewegung muss zum Endzustand passen; information_flow (Publikum/Figuren/Geheim) ohne Widerspruch; Props/Events/introduces/resolves über Kapitel; doppelte oder gestrichene Motive; Timeline und Besitz.
Ignoriere reine Spannungs-/Tempo-Feinschliffe und Formulierungsstil des schreibPrompt — außer sie erzeugen Logikbrüche.
aenderungsPrompts: Continuity/Info-Fluss/Lifecycle reparieren (streichen/ersetzen/verbieten), keine Beat-Politur.${plotPolicy}`;
    }
    if (focus === "craft") {
      return `FOKUS DIESES LAUFS: NUR Craft der Szenenverträge.
Prüfe: Konkretheit (scene_goal, obstacle_conflict, turning_point, outcome_value_change greifbar, keine Platzhalter); Spannung/Tempo der Szenenfolge; Arc-Beats und centralArcs in Szenen sichtbar; schreibPrompt als klarer Prosa-Vertrag (MUSS/DARF-NICHT, Handlungsschritte) — Inhalt der Szene schärfen, nicht Manuskript-Prosa schreiben.
Keine neuen Logistik-Motive erfinden. Logik-Löcher nur melden, wenn die Szene dramaturgisch kollabiert — sonst weglassen (separater Logik-Lauf).
aenderungsPrompts: Dramaturgie/Beats/Abdeckung/schreibPrompt schärfen.${plotPolicy}`;
    }
    return `FOKUS: Gesamt-Szenenplot — Logik und Craft gemischt (max. 3 Aufträge, Härteste zuerst).
Härteste Logikbrüche (Continuity/Info-Fluss) vor Craft (Konkretheit/Spannung/schreibPrompt). Beide nur an Structured-Feldern.${plotPolicy}`;
  }

  const stagePolicy =
    stage === "kapitelgeruest"
      ? structureStageAnalyzePolicy("kapitelgeruest")
      : stage === "manuskript"
        ? `\nSTUFEN-POLITIK: Primär Stil/Lesefluss. Plot-Löcher nur soft melden — echte Plot-Fixes gehören in den Szenenplot.`
        : "";

  if (focus === "logik") {
    return `FOKUS DIESES LAUFS: NUR Logik / Kontinuität / Canon / Props / Widersprüche / Motiv-Verbote.
Ignoriere Stil, Lesefluss und reine Spannungs-Feinschliffe — außer sie sind direkte Logikfolgen.
Kritisch: Fakten, Doppelungen, gestrichene Motive die zurückkommen, Timeline, Besitz/Kennzeichen.
aenderungsPrompts müssen Logik reparieren (streichen/ersetzen/verbieten), keine Stilpolitur.${stagePolicy}`;
  }
  if (focus === "craft") {
    const craftActions =
      stage === "kapitelgeruest"
        ? "aenderungsPrompts: Kapitel-Funktion, Arc Peak/Payoff, Lifecycle schärfen — Skizze bleiben lassen, kein Mini-Buch, keine Dialog-/Prosa-Politur."
        : "aenderungsPrompts: Beats schärfen, Tempo, Dialog-Druck — ohne Canon neu zu erfinden.";
    return `FOKUS DIESES LAUFS: NUR Dramaturgie / Spannung / Szenenwenden / Lesefluss / Straffen.
Keine neuen Logistik-Motive (Auto, ICE, Stellplatz, Hotel als Plot) einführen.
Logik-Widersprüche nur erwähnen, wenn sie die Szene zerstören — sonst weglassen (separater Logik-Lauf).
${craftActions}${stagePolicy}`;
  }
  return `FOKUS: Gesamtstufe — Logik und Craft gemischt (max. 3 Aufträge, Härteste zuerst).${stagePolicy}`;
}

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

const STAGE_VERBESSERN_SCHEMA_HINT = `{
  "kritik": "2–4 Absätze Prosa (oder kurz, wenn wenig fehlt)",
  "aenderungsPrompts": [
    {
      "titel": "kurzer Name",
      "wichtigkeit": "kritisch" | "wichtig" | "nice_to_have",
      "scope": "lokal" | "buchweit",
      "kapitel": [],
      "anweisung": "Imperativ: was genau ändern",
      "entscheidungNoetig": false,
      "entscheidungFrage": ""
    }
  ]
}
Maximal 3 aenderungsPrompts. Leeres Array [] ist erlaubt.
Nummerierte Prosa-Listen → in kritik + aenderungsPrompts überführen.`;

async function parseStageVerbessernRaw(
  raw: string,
  model: AiModelConfig,
  meta: {
    stage: PipelineStage;
    modelLabel: string;
    focus: StageVerbessernFocus;
  },
): Promise<RomanReifegradImprovePlan> {
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: STAGE_VERBESSERN_SCHEMA_HINT,
    errorLabel: "Verbessern-Analyse",
    maxTokens: 4_000,
    timeoutMs: 60_000,
  });
  const dimensionLabel = STAGE_VERBESSERN_FOCUS_LABELS[meta.focus];

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
      dimensionLabel,
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
      dimensionLabel,
      modelLabel: meta.modelLabel,
      kritik,
      aenderungsPrompts: prompts,
      appliedAt: null,
    };
  }
  return { ...plan, dimensionLabel };
}

/**
 * Entwicklungslektor: whole-stage Verbessern analyze → structured plan (no weave).
 */
export async function analyzeStageVerbessern(input: {
  romanId: string;
  stage: PipelineStage;
  /** Default gesamt; logik/craft for 1–2 focused improve runs. */
  focus?: StageVerbessernFocus;
}): Promise<{
  roman: RomanKontext;
  plan: RomanReifegradImprovePlan;
  summary: string;
  runId: string;
}> {
  const focus: StageVerbessernFocus = input.focus ?? "gesamt";
  const focusLabel = STAGE_VERBESSERN_FOCUS_LABELS[focus];
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
      summary: `Verbessern-Analyse · ${stageLabel} · ${focusLabel}`,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: input.stage,
      summary: `Verbessern-Analyse · ${stageLabel} · ${focusLabel}`,
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
      input.stage === "kapitelgeruest" ||
      input.stage === "szenenplot" ||
      input.stage === "manuskript";
    const previousScore = editorial.reifegrade?.[input.stage] ?? null;
    const highBand = highBandLastGapsMandate({
      gesamtPct: previousScore?.gesamtPct,
    });
    const inHighBand =
      previousScore != null &&
      previousScore.gesamtPct >= REIFEGRAD_HIGH_BAND_PP;

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
    ? "\nSpec = Charaktere + Welt + Exposé als ein Brief (Artefakt unten).\nPrüfe ausdrücklich, ob dieses Spec einen ganzen Roman tragen kann — Lücken hier später teuer."
    : input.stage === "kapitelgeruest"
      ? "\nArtefakt = STRUCTURED Kapitelgerüst (Spiegel aus JSON: centralArcs + Kapitel mit Lifecycle/arcBeats). Bewerte genau diese Felder."
      : input.stage === "szenenplot"
        ? "\nArtefakt = STRUCTURED Szenenplot (Spiegel aus JSON: Arcs, Lifecycle, Szenenverträge inkl. schreibPrompt)."
        : ""
}

# Aktueller Reifegrad
${
  previousScore
    ? `Gesamt ${previousScore.gesamtPct}% · Logik ${previousScore.regelnPct}% · ${formatCraftScoresLine(input.stage, previousScore)}`
    : "(noch nicht gemessen)"
}

${highBand}

# Artefakt
${artifact}

${focusAnalyzeAddendum(focus, input.stage)}

Auftrag:
Analysiere knallhart DIESE Stufe (${focusLabel}). Liefere ZWEI Schichten:
1) kritik — Prosa zum Lesen (die 1–3 kritischsten Schwächen mit Belegen). Darf kurz sein, wenn wenig fehlt.
2) aenderungsPrompts — maximal ${inHighBand ? "2" : "3"} ausführbare Änderungsaufträge (WO + WAS), Wichtigkeit zuerst.
   ${inHighBand ? `Hochband: lieber 1–2 tragfähige Pflichtpunkte als leere Liste aus Bequemlichkeit. Leer [] nur mit Begründung in kritik.` : `Leer [] ist OK, wenn nichts kritisch/wichtig fehlt. Nur nice_to_have, wenn wirklich nur Feinschliff übrig ist.`}

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
- KEINE Autor-Entscheidung: entscheidungNoetig immer false, entscheidungFrage leer. Bei Entweder/Oder selbst die tragfähigste Variante wählen und nur diese in anweisung festschreiben (Begründung kurz in kritik).
- Bei Kapitelgerüst/Szenenplot/Manuskript: ${ROMAN_CRITIQUE_SCOPE_MANDATE}
- Kapitelgerüst: anweisung muss Felder nennen (z. B. centralArcs.peakChapter, Kap.3 arcBeats, props streichen).
- Szenenplot: anweisung muss scene_id oder Dramaturgie-/Continuity-Feld nennen.
- Bei anderen Stufen: meist scope „buchweit“, kapitel [].
- Spec (expose): Aufträge dürfen Figuren, Welt oder Exposé betreffen — klar benennen WO.
- Nur diese Stufe. Kein Umschreiben hier. Nur valides JSON.`;

    const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_FOCUS_MANDATE}

Zusatzauftrag Verbessern-Analyse (${stageLabel} · ${focusLabel}):
Du bist Entwicklungslektor:in. ${focusAnalyzeAddendum(focus, input.stage)}
Zwei Schichten: kritik (Prosa) + aenderungsPrompts (0–${inHighBand ? "2" : "3"}, mit wichtigkeit).
${ROMAN_CRITIQUE_QUOTE_GROUNDING}
Keine Autor-Entscheidungen: bei Alternativen selbst die beste Variante wählen und in anweisung festschreiben.
${inHighBand ? `Hochband (≥${REIFEGRAD_HIGH_BAND_PP}%): letzte tragfähige Lücken suchen — kein automatisches „trägt schon → leer“.` : `Unter Hochband: leere aenderungsPrompts nur wenn wirklich nichts Pflichtiges fehlt.`}
${highBand}
Antworte AUSSCHLIESSLICH als JSON-Objekt mit Keys kritik und aenderungsPrompts — keine nummerierte Prosa außerhalb von JSON.`;

    const { result: planRaw, usage } = await runWithAiUsageCollector(async () => {
      const raw = await generateText({
        model,
        systemInstruction: system,
        userText,
        preferJson: true,
        maxTokens: 4_000,
        timeoutMs: 90_000,
      });
      return parseStageVerbessernRaw(raw, model, {
        stage: input.stage,
        modelLabel: model.label,
        focus,
      });
    });
    const { kept } = filterAenderungsPromptsByGrounding(
      planRaw.aenderungsPrompts,
      artifact,
      { stage: input.stage },
    );
    const plan = {
      ...planRaw,
      aenderungsPrompts: narrowAenderungsPromptsWithKritikChapters(
        kept,
        planRaw.kritik,
      ),
    };

    events.push(
      historyEvent({
        type: "critique",
        stage: input.stage,
        roleKey: "entwicklungslektor",
        modelLabel: plan.modelLabel,
        summary: `Verbessern (${focusLabel}) · ${plan.aenderungsPrompts.length} Aufträge`,
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
        ? `${stageLabel} · ${focusLabel}: ${actionable.length} Pflichtauftrag/aufträge — Einarbeiten im Dialog.`
        : onlyNiceToHavePrompts(plan.aenderungsPrompts)
          ? `${stageLabel} · ${focusLabel}: nur Nice-to-have — so belassen.`
          : `${stageLabel} · ${focusLabel}: keine Pflichtpunkte — so belassen.`;

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
 * Apply stored stage Verbessern plan (Gerüst/Plot: Lektor-Struktur-Patch; Manuskript: Co-Autor → re-score).
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

  const snapshotEditorial = structuredClone(
    loaded.editorial ?? emptyRomanEditorial(),
  );
  const snapshotRoots = {
    manuskriptRaw: loaded.manuskriptRaw,
    charaktere: loaded.charaktere,
    weltSchauplaetze: loaded.weltSchauplaetze,
    weltRegeln: loaded.weltRegeln,
  };

  try {
    let roman = loaded;
    const allPatched: number[] = [];
    const chapterDoc = improveChapterDoc(roman, input.stage);

    if (
      input.stage === "manuskript" ||
      input.stage === "szenenplot" ||
      input.stage === "kapitelgeruest"
    ) {
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
            roleKey: romanApplyRoleKey(input.stage),
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
            roleKey: romanApplyRoleKey(applyStage),
            summary: applied.summary,
            usage,
          }),
        );
      }
    }

    const uniquePatched = [...new Set(allPatched)].sort((a, b) => a - b);
    const ed = roman.editorial ?? emptyRomanEditorial();
    const previous = snapshotEditorial.reifegrade?.[input.stage] ?? null;
    let nextEd = ed;

    try {
      const { result: assessed, usage: reifeUsage } =
        await runWithAiUsageCollector(() =>
          assessStageReifegrad({
            roman: { ...roman, editorial: nextEd },
            stage: input.stage,
            // Full artifact (no focus sample) so Gesamt is not skewed by local patch.
            previous,
            changeSummary: `Verbessern · ${stageLabel} eingearbeitet`,
          }),
        );
      const score = assessed.score;
      const coverageLabel = formatAssessCoverageLabel(assessed.coverage);

      if (reifegradGesamtRegressed(previous, score)) {
        roman = await persistEditorial(
          { ...roman, ...snapshotRoots },
          snapshotEditorial,
        );
        const regression = formatReifegradRegressionSummary({
          label: stageLabel,
          previousPct: previous!.gesamtPct,
          nextPct: score.gesamtPct,
        });
        events.push(
          historyEvent({
            type: "info",
            stage: input.stage,
            modelLabel: score.modelLabel,
            summary: regression,
            usage: reifeUsage,
          }),
        );
        await updatePipelineHistoryRun({ runId, status: "ok", events });
        return {
          roman,
          summary: regression,
          runId,
          patchedChapters: [],
        };
      }

      const markedPlan: RomanReifegradImprovePlan = {
        ...plan,
        appliedAt: new Date().toISOString(),
      };
      nextEd = editorialWithReifegrad(
        withStageImprove(ed, input.stage, markedPlan),
        input.stage,
        score,
      );
      roman = await persistEditorial(roman, nextEd);
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
      // Keep patched content if assess fails — no score proof of regression.
      const markedPlan: RomanReifegradImprovePlan = {
        ...plan,
        appliedAt: new Date().toISOString(),
      };
      nextEd = withStageImprove(ed, input.stage, markedPlan);
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
