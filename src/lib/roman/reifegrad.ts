/**
 * Entwicklungslektor maturity assessment for a pipeline stage artifact.
 * Four equal dimensions: Logik + 3 stage-specific craft axes.
 * (Bedürfnis-Felder bleiben in JSON für Kompatibilität, immer 0 bei Neu-Assess.)
 */

import { generateText } from "@/lib/ai/provider";
import { AI_FETCH_TIMEOUT_MAX_MS } from "@/lib/ai/fetch-timeout";
import { lowestReasoningEffortForScoring } from "@/lib/ai/reasoning-effort";
import {
  ROMAN_ALTER_PRESETS,
  buildCritiqueRulesAndNeedsBlock,
  countWords,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  findAlterPresetId,
  formatWordCount,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { CLIP, PROMPT_SOFT_CAP_CHARS } from "@/lib/roman/pipeline/quality-brief";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import {
  formatChapterBlock,
  parsePlotChapters,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  craftDimensionsForStage,
  type ReifegradCraftSlot,
} from "@/lib/roman/reifegrad-craft";
import {
  buildStageReifegrad,
  withStageReifegrad,
  type StageReifegrad,
} from "@/lib/roman/reifegrad-model";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanKontext } from "@/lib/roman/types";

export type {
  ReifegradErfuellung,
  ReifegradFreigabe,
  RomanReifegrade,
  StageReifegrad,
} from "@/lib/roman/reifegrad-model";
export {
  REIFEGRAD_ERFUELLUNG_LABEL,
  REIFEGRAD_FREIGABE_LABEL,
  REIFEGRAD_UPSTREAM_HARD_PCT,
  REIFEGRAD_UPSTREAM_SOFT_PCT,
  buildStageReifegrad,
  clearReifegradeForStages,
  computeGesamtPct,
  emptyRomanReifegrade,
  erfuellungFromPct,
  formatReifegradeForRouter,
  freigabeFromPct,
  mayPatchUpstreamByReifegrad,
  parseRomanReifegrade,
  withStageReifegrad,
} from "@/lib/roman/reifegrad-model";

function clampPct(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Soft ceiling for a single assess call (~200k tokens). Below this the full
 * stage artifact is always sent; sampling only kicks in above (emergency).
 * Same ceiling as Erzeugen / Verbessern / Gegenlesen ({@link PROMPT_SOFT_CAP_CHARS}).
 */
const ASSESS_SOFT_CAP_CHARS = PROMPT_SOFT_CAP_CHARS;

export type StageArtifactCoverage = {
  sourceChars: number;
  sourceWords: number;
  assessedChars: number;
  assessedWords: number;
  /** False only when soft-cap forced a chapter sample. */
  complete: boolean;
};

/** History/toast line — compare with the word count under the stage text field. */
export function formatAssessCoverageLabel(
  coverage: StageArtifactCoverage,
): string {
  const assessed = formatWordCount(coverage.assessedWords);
  if (coverage.complete) {
    return `Bewertet: ${assessed} Wörter (vollständig)`;
  }
  return `Bewertet: ${assessed} von ${formatWordCount(coverage.sourceWords)} Wörtern (Notfall-Auszug)`;
}

function coverageFor(source: string, assessed: string): StageArtifactCoverage {
  const sourceTrim = source.trim();
  const assessedTrim = assessed.trim();
  return {
    sourceChars: sourceTrim.length,
    sourceWords: countWords(sourceTrim),
    assessedChars: assessedTrim.length,
    assessedWords: countWords(assessedTrim),
    complete:
      !sourceTrim ||
      assessedTrim.length >= sourceTrim.length ||
      assessedTrim === sourceTrim,
  };
}

/** Strip diacritics so `vernachlässigt…` matches `vernachlaessigt…`. */
function normalizeKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function lookupPct(
  obj: Record<string, unknown>,
  aliases: string[],
): number | null {
  const byNorm = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    byNorm.set(normalizeKey(k), v);
  }
  for (const alias of aliases) {
    const v = byNorm.get(normalizeKey(alias));
    if (v == null || v === "") continue;
    if (typeof v === "number" || typeof v === "string") return clampPct(v);
  }
  return null;
}

function formatSpecBrief(roman: RomanKontext): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const chars = formatCharaktere(roman.charaktere).trim();
  const welt = [
    roman.weltSchauplaetze.trim() &&
      `Schauplätze:\n${roman.weltSchauplaetze.trim()}`,
    roman.weltRegeln.trim() && `Regeln:\n${roman.weltRegeln.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const expose = exposeTextFromEditorial(ed).trim();
  return [
    chars && `## Charaktere\n${chars}`,
    welt && `## Welt\n${welt}`,
    expose && `## Exposé\n${expose}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function rawStageArtifact(
  roman: RomanKontext,
  stage: PipelineStage,
): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  switch (stage) {
    case "idee":
      return (ed.ideeKurz ?? "").trim();
    case "charaktere":
      return formatCharaktere(roman.charaktere).trim();
    case "welt":
      return [
        roman.weltSchauplaetze.trim() &&
          `Schauplätze:\n${roman.weltSchauplaetze.trim()}`,
        roman.weltRegeln.trim() && `Regeln:\n${roman.weltRegeln.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    case "expose":
      // Spec tab = combined brief (Figuren + Welt + Exposé).
      return formatSpecBrief(roman);
    case "szenenplot":
      return (roman.manuskriptRaw ?? "").trim();
    case "manuskript":
      return (ed.manuskriptText ?? "").trim();
  }
}

/**
 * Full stage artifact for Reifegrad assess. Only samples chapters if the
 * document exceeds {@link ASSESS_SOFT_CAP_CHARS} (emergency).
 */
export function getStageArtifactForAssess(
  roman: RomanKontext,
  stage: PipelineStage,
  options?: { focusChapterNumbers?: number[] },
): { text: string; coverage: StageArtifactCoverage } {
  const source = rawStageArtifact(roman, stage);
  if (!source) {
    return { text: "(leer)", coverage: coverageFor("", "(leer)") };
  }
  if (source.length <= ASSESS_SOFT_CAP_CHARS) {
    return { text: source, coverage: coverageFor(source, source) };
  }
  if (stage === "szenenplot" || stage === "manuskript") {
    const sampled = sampleChapterDocForAssess(
      source,
      ASSESS_SOFT_CAP_CHARS,
      options?.focusChapterNumbers,
    );
    return {
      text: sampled || source.slice(0, ASSESS_SOFT_CAP_CHARS),
      coverage: coverageFor(source, sampled || source.slice(0, ASSESS_SOFT_CAP_CHARS)),
    };
  }
  const clipped = source.slice(0, ASSESS_SOFT_CAP_CHARS);
  return { text: clipped, coverage: coverageFor(source, clipped) };
}

/**
 * Stage artifact for dimension critique / improve prompts (CLIP budgets).
 * Reifegrad scoring uses {@link getStageArtifactForAssess} instead.
 */
export function getStageArtifactText(
  roman: RomanKontext,
  stage: PipelineStage,
  options?: { focusChapterNumbers?: number[]; budget?: number },
): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const budget = options?.budget;
  switch (stage) {
    case "idee":
      return (
        (ed.ideeKurz ?? "").slice(0, budget ?? CLIP.idee) || "(leer)"
      );
    case "charaktere":
      return (
        formatCharaktere(roman.charaktere).slice(
          0,
          budget ?? CLIP.charaktere,
        ) || "(leer)"
      );
    case "welt":
      return (
        [
          roman.weltSchauplaetze.trim() &&
            `Schauplätze:\n${roman.weltSchauplaetze.trim()}`,
          roman.weltRegeln.trim() && `Regeln:\n${roman.weltRegeln.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, budget ?? CLIP.weltCombined) || "(leer)"
      );
    case "expose":
      return (
        formatSpecBrief(roman).slice(0, budget ?? CLIP.expose) || "(leer)"
      );
    case "szenenplot":
      return (
        sampleChapterDocForAssess(
          roman.manuskriptRaw ?? "",
          budget ?? CLIP.szenenplot,
          options?.focusChapterNumbers,
        ) || "(leer)"
      );
    case "manuskript":
      return (
        sampleChapterDocForAssess(
          ed.manuskriptText ?? "",
          budget ?? CLIP.manuskript,
          options?.focusChapterNumbers,
        ) || "(leer)"
      );
  }
}

/**
 * Emergency sample when a document exceeds the soft cap: prefer focus
 * chapters, then evenly sample the rest (never used under the soft cap).
 */
function sampleChapterDocForAssess(
  doc: string,
  budget: number,
  focusChapterNumbers?: number[],
): string {
  const trimmed = doc.trim();
  if (!trimmed) return "";
  if (trimmed.length <= budget) return trimmed;

  const chapters = parsePlotChapters(trimmed);
  if (chapters.length < 2) return trimmed.slice(0, budget);

  const focus = new Set(
    (focusChapterNumbers ?? []).filter((n) => Number.isFinite(n) && n > 0),
  );
  const focusChapters = chapters.filter((c) => focus.has(c.number));
  const others = chapters.filter((c) => !focus.has(c.number));

  const picked: PlotChapter[] = [...focusChapters];
  const bookends = [chapters[0]!, chapters[chapters.length - 1]!];
  for (const edge of bookends) {
    if (!picked.some((c) => c.number === edge.number)) picked.push(edge);
  }

  const remaining = others.filter(
    (c) => !picked.some((p) => p.number === c.number),
  );
  if (remaining.length > 0) {
    const slots = Math.max(2, Math.min(remaining.length, 10));
    for (let i = 0; i < slots; i += 1) {
      const idx = Math.round((i * (remaining.length - 1)) / (slots - 1));
      const ch = remaining[idx]!;
      if (!picked.some((p) => p.number === ch.number)) picked.push(ch);
    }
  }

  picked.sort((a, b) => a.number - b.number);
  const parts: string[] = [
    `(Notfall-Auszug ${picked.length}/${chapters.length} Kapitel — Soft-Cap ${budget.toLocaleString("de-DE")} Zeichen; Fokus: ${
      focusChapters.length
        ? focusChapters.map((c) => c.number).join(", ")
        : "Streuung"
    })`,
  ];
  let used = parts[0]!.length;
  for (const ch of picked) {
    const block = formatChapterBlock(ch);
    if (used + block.length + 2 > budget) {
      const room = budget - used - 2;
      if (room > 400) {
        parts.push(`${block.slice(0, room)}\n…`);
      }
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n").slice(0, budget);
}

function altergruppeLabel(editorial: RomanEditorial): string {
  const presetId = findAlterPresetId(editorial);
  const preset = ROMAN_ALTER_PRESETS.find((p) => p.id === presetId);
  if (preset?.label) return preset.label;
  const min = editorial.zielAlterMin;
  const max = editorial.zielAlterMax;
  if (min != null && max != null) return `${min}–${max} Jahre`;
  if (min != null) return `ab ${min} Jahren`;
  return "(Altersklasse nicht gesetzt — trotzdem altersangemessen schätzen)";
}

function readCraftPct(
  obj: Record<string, unknown>,
  slot: ReifegradCraftSlot,
  craftKey: string,
): number {
  const slotAliases: Record<ReifegradCraftSlot, string[]> = {
    a: [
      "craftAPct",
      "craftA",
      "stilPct",
      "stil",
      "funktionPct",
      "funktion",
      "konkretheitPct",
      "konkretheit",
    ],
    b: ["craftBPct", "craftB", "dramaturgiePct", "dramaturgie"],
    c: [
      "craftCPct",
      "craftC",
      "leseflussPct",
      "lesefluss",
      "abdeckungPct",
      "abdeckung",
      "uebergaengePct",
      "uebergaenge",
    ],
  };
  const found = lookupPct(obj, [
    `${craftKey}Pct`,
    craftKey,
    ...slotAliases[slot],
  ]);
  return found ?? 0;
}

function repairJsonText(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/([{,]\s*)([A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  for (const candidate of [slice, repairJsonText(slice)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
        return parsed[0] as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Last-resort: pull `key: 72` / `"key": 72` numbers from messy model prose. */
function extractPctLoose(raw: string, keys: string[]): number | null {
  for (const key of keys) {
    const re = new RegExp(
      `["']?${key}["']?\\s*[:=]\\s*["']?(\\d{1,3})(?:\\.\\d+)?%?["']?`,
      "i",
    );
    const match = raw.match(re);
    if (match) return clampPct(match[1]);
  }
  return null;
}

/**
 * If the model dumps four percentages in order without keys, take them.
 * Order: logik, craftA, craftB, craftC.
 * Also accepts legacy six-value sequences (logik, ignore, ignore, craft…).
 */
function extractFourPctSequence(raw: string): number[] | null {
  const matches = [...raw.matchAll(/(\d{1,3})\s*%/g)];
  const values: number[] = [];
  for (const m of matches) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n > 100) continue;
    values.push(Math.round(n));
    if (values.length >= 6) break;
  }
  if (values.length >= 6) {
    return [values[0]!, values[3]!, values[4]!, values[5]!];
  }
  return values.length >= 4 ? values.slice(0, 4) : null;
}

type ScoreBundle = {
  regelnPct: number;
  erfuelltesBeduerfnisPct: number;
  vernachlaessigtesBeduerfnisPct: number;
  stilPct: number;
  dramaturgiePct: number;
  leseflussPct: number;
};

function scoresFromRecord(
  obj: Record<string, unknown>,
  stage: PipelineStage,
): ScoreBundle | null {
  const [craftA, craftB, craftC] = craftDimensionsForStage(stage);
  const logikPct = lookupPct(obj, [
    "logikPct",
    "logik",
    "regelnPct",
    "regeln",
  ]);
  // Require Logik — empty `{}` must not become all zeros.
  if (logikPct == null) {
    return null;
  }
  return {
    regelnPct: logikPct,
    erfuelltesBeduerfnisPct: 0,
    vernachlaessigtesBeduerfnisPct: 0,
    stilPct: readCraftPct(obj, "a", craftA.key),
    dramaturgiePct: readCraftPct(obj, "b", craftB.key),
    leseflussPct: readCraftPct(obj, "c", craftC.key),
  };
}

function parseScoresFromModel(
  raw: string,
  stage: PipelineStage,
): ScoreBundle {
  const [craftA, craftB, craftC] = craftDimensionsForStage(stage);
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "Reifegrad-Antwort leer — Modell hat keinen Text geliefert.",
    );
  }

  const obj = tryParseJsonObject(trimmed);
  if (obj) {
    const fromObj = scoresFromRecord(obj, stage);
    if (fromObj) return fromObj;
  }

  // Prose / broken JSON: require Logik + craft signals.
  const logikPct = extractPctLoose(trimmed, [
    "logikPct",
    "logik",
    "regelnPct",
    "regeln",
  ]);
  const stilPct =
    extractPctLoose(trimmed, [
      "craftAPct",
      `${craftA.key}Pct`,
      craftA.key,
      "stilPct",
      "stil",
    ]) ?? 0;
  const dramaturgiePct =
    extractPctLoose(trimmed, [
      "craftBPct",
      `${craftB.key}Pct`,
      craftB.key,
      "dramaturgiePct",
      "dramaturgie",
    ]) ?? 0;
  const leseflussPct =
    extractPctLoose(trimmed, [
      "craftCPct",
      `${craftC.key}Pct`,
      craftC.key,
      "leseflussPct",
      "lesefluss",
      "uebergaengePct",
      "uebergaenge",
    ]) ?? 0;

  if (logikPct != null) {
    return {
      regelnPct: logikPct,
      erfuelltesBeduerfnisPct: 0,
      vernachlaessigtesBeduerfnisPct: 0,
      stilPct,
      dramaturgiePct,
      leseflussPct,
    };
  }

  const seq = extractFourPctSequence(trimmed);
  if (seq) {
    return {
      regelnPct: seq[0]!,
      erfuelltesBeduerfnisPct: 0,
      vernachlaessigtesBeduerfnisPct: 0,
      stilPct: seq[1]!,
      dramaturgiePct: seq[2]!,
      leseflussPct: seq[3]!,
    };
  }

  throw new Error(
    "Reifegrad-Antwort ohne auswertbare Prozentwerte — Bewertung fehlgeschlagen.",
  );
}

/**
 * Bewerter scores the stage artifact on four maturity dimensions (Logik + craft).
 * Sends the full stage document (soft-cap only as emergency). Uses the lowest
 * valid reasoning effort so structured JSON is not starved by thinking tokens.
 */
export async function assessStageReifegrad(input: {
  roman: RomanKontext;
  stage: PipelineStage;
  /** Prefer these chapters if soft-cap sampling is forced (just-patched). */
  focusChapterNumbers?: number[];
  /** Prior score for calibration — model should re-evaluate, not copy. */
  previous?: StageReifegrad | null;
  /** Short note what changed (e.g. „Kapitel 3, 7, 12 gepatcht“). */
  changeSummary?: string;
}): Promise<{ score: StageReifegrad; coverage: StageArtifactCoverage }> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const compliance = buildCritiqueRulesAndNeedsBlock(editorial);
  const { text: artifact, coverage } = getStageArtifactForAssess(
    input.roman,
    input.stage,
    { focusChapterNumbers: input.focusChapterNumbers },
  );
  const label = PIPELINE_STAGE_LABELS[input.stage];
  const alter = altergruppeLabel(editorial);
  const [craftA, craftB, craftC] = craftDimensionsForStage(input.stage);
  const previous = input.previous;
  const prevBlock = previous
    ? `# Vorherige Messung (nicht kopieren — neu bewerten)
Gesamt ${previous.gesamtPct}% · Logik ${previous.regelnPct}% · ${craftA.label} ${previous.stilPct}% · ${craftB.label} ${previous.dramaturgiePct}% · ${craftC.label} ${previous.leseflussPct}%
Wenn das Artefakt besser/schlechter wurde, MÜSSEN die Prozentwerte sich bewegen.`
    : "";
  const changeBlock = input.changeSummary?.trim()
    ? `# Gerade geändert\n${input.changeSummary.trim()}`
    : "";
  const coverageNote = coverage.complete
    ? `Das Artefakt unten ist VOLLSTÄNDIG (${formatWordCount(coverage.assessedWords)} Wörter) — bewerte alles, nicht nur den Anfang.`
    : `Hinweis: Notfall-Auszug (${formatWordCount(coverage.assessedWords)} von ${formatWordCount(coverage.sourceWords)} Wörtern) wegen Soft-Cap — trotzdem streng und repräsentativ bewerten.`;

  const { rolle, model } = await resolveRomanKiRolle("bewerter");

  const userText = `${compliance}

# Altersklasse (verbindlich für die drei Craft-Dimensionen)
${alter}
lesestufe: ${editorial.lesestufe?.trim() || "—"}

# Stufe
${label} (${input.stage})${
  input.stage === "expose"
    ? "\nSpec = Charaktere + Welt + Exposé zusammen bewerten."
    : ""
}

${prevBlock}

${changeBlock}

# Artefakt dieser Stufe (zu bewerten)
${coverageNote}

${artifact}

Auftrag:
Bewerte knallhart DIESES Artefakt in VIER Dimensionen (Logik + drei Craft-Achsen).
Die drei Craft-Dimensionen sind STUFENSPEZIFISCH.
Craft muss zur Altersklasse passen.
Keine separate Bewertung von Marktanalyse-Bedürfnissen.
${previous ? "Vergleiche mit der vorherigen Messung: gleiche Werte nur bei wirklich unverändertem Qualitätsniveau." : ""}

Antwort NUR als JSON-Objekt (keine Markdown-Fences, kein Text drumherum):
{"logikPct":0,"craftAPct":0,"craftBPct":0,"craftCPct":0}

Dimensionen:
- logikPct: innere Logik, Kontinuität, Ursache/Wirkung, keine Widersprüche zu Figuren/Ort/Fakten
- craftAPct (= ${craftA.key} / ${craftA.label}): ${craftA.brief.split("\n")[0]}
- craftBPct (= ${craftB.key} / ${craftB.label}): ${craftB.brief.split("\n")[0]}
- craftCPct (= ${craftC.key} / ${craftC.label}): ${craftC.brief.split("\n")[0]}

Skala: 0 = fehlt völlig, 40 = ansatzweise, 75 = weitgehend, 100 = klar und belastbar.`;

  const system = `${rolle.systemPrompt}

Zusatzauftrag Reifegrad-Messung (${label}):
Du bist Bewerter:in. Du schreibst nichts um — nur vier Prozentwerte als JSON.
Craft-Achsen dieser Stufe: ${craftA.label}, ${craftB.label}, ${craftC.label}.
Altersklasse steuert die Craft-Scores streng mit.
Sei streng und konsistent. Ausgabe: genau ein JSON-Objekt, keine Prosa.`;

  const scoringEffort = lowestReasoningEffortForScoring(model.modelSlug);
  const assessCall = (opts: {
    systemInstruction: string;
    userText: string;
    maxTokens: number;
    timeoutMs: number;
  }) =>
    generateText({
      model,
      systemInstruction: opts.systemInstruction,
      userText: opts.userText,
      preferJson: true,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
      reasoningEffort: scoringEffort,
    });

  let lastError: unknown;
  const attempts: Array<{
    systemInstruction: string;
    userText: string;
    maxTokens: number;
    timeoutMs: number;
  }> = [
    {
      systemInstruction: system,
      userText,
      maxTokens: 1_500,
      timeoutMs: AI_FETCH_TIMEOUT_MAX_MS,
    },
    {
      systemInstruction: `Du antwortest ausschließlich mit einem JSON-Objekt mit genau diesen Keys (Zahlen 0–100):
logikPct, craftAPct, craftBPct, craftCPct.
Keine Markdown-Fences, keine Erklärung.`,
      userText: `Stufe: ${label}
Altersklasse: ${alter}
${prevBlock}
${changeBlock}
${coverageNote}

Artefakt (vollständig bzw. Soft-Cap-Auszug — gleiches Material wie im ersten Versuch):
${artifact}

Gib jetzt korrektes JSON.`,
      maxTokens: 800,
      timeoutMs: AI_FETCH_TIMEOUT_MAX_MS,
    },
  ];

  for (const attempt of attempts) {
    try {
      const raw = await assessCall(attempt);
      const scores = parseScoresFromModel(raw, input.stage);
      return {
        score: buildStageReifegrad({
          ...scores,
          modelLabel: model.label,
          stage: input.stage,
        }),
        coverage,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Reifegrad-Bewertung fehlgeschlagen.");
}

/** Persist assessed score onto roman editorial via caller’s upsert. */
export function editorialWithReifegrad(
  editorial: RomanEditorial,
  stage: PipelineStage,
  score: StageReifegrad,
): RomanEditorial {
  return withStageReifegrad(editorial, stage, score);
}
