/**
 * Entwicklungslektor maturity assessment for a pipeline stage artifact.
 * Four equal dimensions: Logik + 3 stage-specific craft axes.
 * (Bedürfnis-Felder bleiben in JSON für Kompatibilität, immer 0 bei Neu-Assess.)
 */

import { generateText } from "@/lib/ai/provider";
import { AI_FETCH_TIMEOUT_MAX_MS } from "@/lib/ai/fetch-timeout";
import {
  lowestReasoningEffortForScoring,
  reasoningEffortOptionsForModel,
  resolveReasoningEffort,
} from "@/lib/ai/reasoning-effort";
import {
  ROMAN_ALTER_PRESETS,
  buildCritiqueRulesAndNeedsBlock,
  countWords,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  findAlterPresetId,
  formatWissensGraphForPrompt,
  formatWordCount,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  CLIP,
  PROMPT_SOFT_CAP_CHARS,
  specStageAnalyzePolicy,
} from "@/lib/roman/pipeline/quality-brief";
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
  formatCentralArcsBlock,
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import {
  craftDimensionsForAssessKey,
  craftDimensionsForStage,
  pipelineStageForAssessKey,
  type ReifegradCraftSlot,
} from "@/lib/roman/reifegrad-craft";
import {
  buildStageReifegrad,
  parseReifegradBelege,
  withStageReifegrad,
  type ReifegradAssessKey,
  type ReifegradBeleg,
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

/**
 * Compact upstream canon for Graph / Plot / Szenen assessment & analysis
 * so Logik/Abdeckung are judged against the actual rules, characters, world,
 * expose, and knowledge graph — not in a vacuum.
 */
export function formatStructureCanonReferenceBlock(
  roman: RomanKontext,
  options?: { includeGraph?: boolean },
): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const includeGraph = options?.includeGraph ?? true;
  const ki = (roman.kiRegelwerk ?? "").trim().slice(0, 2_000);
  const chars = formatCharaktere(roman.charaktere).trim().slice(0, 6_500);
  const welt = [
    roman.weltSchauplaetze.trim() &&
      `Schauplätze: ${roman.weltSchauplaetze.trim().slice(0, 2_500)}`,
    roman.weltRegeln.trim() &&
      `Weltregeln: ${roman.weltRegeln.trim().slice(0, 9_000)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const expose = exposeTextFromEditorial(ed).trim().slice(0, 9_000);
  const idee = (ed.ideeKurz ?? "").trim().slice(0, 4_000);
  const graph = includeGraph
    ? formatWissensGraphForPrompt(ed.wissensGraph, {
        maxChars: 8_000,
      }).trim()
    : "";

  const parts = [
    "# Kanon-Referenz (Upstream-Basis für Konsistenz, Logik & Abdeckung)",
    ki && `## KI-Regelwerk\n${ki}`,
    chars && `## Fundament — Charaktere\n${chars}`,
    welt && `## Fundament — Welt\n${welt}`,
    expose && `## Exposé\n${expose}`,
    idee && `## Ideenkern\n${idee}`,
    graph && `## Wissensgraph (Knoten, Attrs & Invarianten)\n${graph}`,
  ].filter(Boolean);

  return parts.length > 1 ? parts.join("\n\n") : "";
}

const SZENENPLOT_SOLL_MAX_CHARS = 60_000;

/**
 * Compact per-chapter Soll from the structured Szenenplot (kernsatz, events,
 * lifecycle, per-scene info-flow + state-after). This is what Manuskript
 * Logik/Kontinuität must be judged against — not the full beat sheet.
 */
export function formatSzenenplotSollBlock(
  structured: RomanSzenenplotStructured | null | undefined,
  maxChars = SZENENPLOT_SOLL_MAX_CHARS,
): string {
  if (!structured?.chapters?.length) return "";
  const lines: string[] = [];
  const arcs = formatCentralArcsBlock(structured.centralArcs).trim();
  if (arcs) lines.push(arcs, "");
  for (const ch of structured.chapters) {
    lines.push(`### Kap. ${ch.number} — ${ch.title.trim() || "—"}`);
    if (ch.kernsatz.trim()) lines.push(`Kernsatz: ${ch.kernsatz.trim()}`);
    if (ch.events.length) lines.push(`Events: ${ch.events.join(" · ")}`);
    if (ch.introduces.length) lines.push(`Führt ein: ${ch.introduces.join(" · ")}`);
    if (ch.resolves.length) lines.push(`Löst: ${ch.resolves.join(" · ")}`);
    if (ch.mustNotRepeat.length) {
      lines.push(`Darf nicht (mehr): ${ch.mustNotRepeat.join(" · ")}`);
    }
    for (const sc of ch.scenes) {
      const flow = sc.information_flow;
      const states = Object.entries(sc.continuity?.character_states_after ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      lines.push(
        `- ${sc.scene_id} ${sc.heading.trim()}${
          flow?.revealed_to_characters?.trim()
            ? ` | Figuren erfahren: ${flow.revealed_to_characters.trim()}`
            : ""
        }${flow?.kept_secret?.trim() ? ` | Geheim bleibt: ${flow.kept_secret.trim()}` : ""}${
          states ? ` | Zustand danach: ${states}` : ""
        }`,
      );
    }
    lines.push("");
  }
  const text = lines.join("\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}

/**
 * Canon for Manuskript / Roman assessment: upstream canon (rules, Figuren,
 * Welt, Exposé, Graph) plus the Szenenplot Soll per chapter. Without this the
 * Bewerter judged „Logik/Kontinuität“ of 70k words against ~3.5k chars of rules.
 */
export function formatManuskriptCanonReferenceBlock(
  roman: RomanKontext,
): string {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const base = formatStructureCanonReferenceBlock(roman, { includeGraph: true });
  const soll = formatSzenenplotSollBlock(ed.szenenplotStructured);
  return [
    base,
    soll &&
      `## Szenenplot-Soll je Kapitel (Logik/Kontinuität: Wer weiß wann was · Zustand danach · Darf-nicht)\n${soll}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function rawStageArtifact(
  roman: RomanKontext,
  stage: ReifegradAssessKey,
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
    case "rahmen":
      return [
        roman.genre.trim() && `Genre: ${roman.genre.trim()}`,
        roman.tonalitaet.trim() && `Tonalität:\n${roman.tonalitaet.trim()}`,
        roman.perspektive.trim() && `Perspektive: ${roman.perspektive.trim()}`,
        roman.zeitform.trim() && `Zeitform: ${roman.zeitform.trim()}`,
        ed.grobRegeln.trim() && `Grob-Regeln:\n${ed.grobRegeln.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    case "fundament":
      return [
        formatCharaktere(roman.charaktere).trim() &&
          `## Charaktere\n${formatCharaktere(roman.charaktere).trim()}`,
        roman.weltSchauplaetze.trim() &&
          `## Welt · Schauplätze\n${roman.weltSchauplaetze.trim()}`,
        roman.weltRegeln.trim() &&
          `## Welt · Regeln\n${roman.weltRegeln.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    case "graph": {
      // Pretty JSON of 100 nodes blows past 60k before edges/invariants, so
      // the Bewerter scored Vernetzung against a graph that looked edgeless.
      const g = ed.wissensGraph;
      if (!g?.nodes.length) return "";
      const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
      const invariants = (g.hardInvariants ?? []).map((h) => `- ${h}`).join("\n");
      const edges = (g.edges ?? [])
        .map(
          (e) =>
            `- ${e.from} —[${e.rel}]→ ${e.to}${e.note ? ` (${clip(e.note, 160)})` : ""}`,
        )
        .join("\n");
      const nodes = g.nodes
        .map((n) => {
          const attrs = Object.entries(n.attrs ?? {})
            .filter(([, v]) => String(v ?? "").trim())
            .map(([k, v]) => `${k}=${clip(String(v), 180)}`)
            .join("; ");
          return `- ${n.id} (${n.kind}) ${n.label}${
            n.summary ? `: ${clip(n.summary, 160)}` : ""
          }${attrs ? ` | ${attrs}` : ""}`;
        })
        .join("\n");
      return [
        `# Harte Invarianten (${g.hardInvariants?.length ?? 0})`,
        invariants || "(keine)",
        `# Kanten (${g.edges?.length ?? 0})`,
        edges || "(keine)",
        `# Knoten (${g.nodes.length})`,
        nodes,
      ].join("\n");
    }
    case "kapitelgeruest":
    case "grobgeruest":
    case "feingeruest":
    case "plot": {
      const structured = ed.kapitelGeruestStructured;
      if (structured?.chapters?.length) {
        return structuredKapitelGeruestToMarkdown(structured).trim();
      }
      return (ed.kapitelGeruestRaw ?? "").trim();
    }
    case "szenenplot":
    case "grobplot":
    case "feinplot":
    case "szenen": {
      const structured = ed.szenenplotStructured;
      if (structured?.chapters?.length) {
        return structuredSzenenplotToMarkdown(structured).trim();
      }
      return (roman.manuskriptRaw ?? "").trim();
    }
    case "manuskript":
      return (ed.manuskriptText ?? "").trim();
    case "roman":
      return (ed.romanText ?? "").trim();
    default:
      return "";
  }
}

const REIFEGRAD_ASSESS_LABELS: Record<ReifegradAssessKey, string> = {
  ...PIPELINE_STAGE_LABELS,
  roman: "Roman",
};

/**
 * Full stage artifact for Reifegrad assess. Only samples chapters if the
 * document exceeds {@link ASSESS_SOFT_CAP_CHARS} (emergency).
 */
export function getStageArtifactForAssess(
  roman: RomanKontext,
  stage: ReifegradAssessKey,
  options?: { focusChapterNumbers?: number[] },
): { text: string; coverage: StageArtifactCoverage } {
  const source = rawStageArtifact(roman, stage);
  if (!source) {
    return { text: "(leer)", coverage: coverageFor("", "(leer)") };
  }
  if (source.length <= ASSESS_SOFT_CAP_CHARS) {
    return { text: source, coverage: coverageFor(source, source) };
  }
  if (
    stage === "plot" ||
    stage === "kapitelgeruest" ||
    stage === "grobgeruest" ||
    stage === "feingeruest" ||
    stage === "szenen" ||
    stage === "szenenplot" ||
    stage === "grobplot" ||
    stage === "feinplot" ||
    stage === "manuskript" ||
    stage === "roman"
  ) {
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
  stage: ReifegradAssessKey,
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
    case "rahmen":
      return (
        [
          roman.genre.trim() && `Genre: ${roman.genre.trim()}`,
          roman.tonalitaet.trim() && `Tonalität:\n${roman.tonalitaet.trim()}`,
          ed.grobRegeln.trim() && `Grob-Regeln:\n${ed.grobRegeln.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, budget ?? CLIP.expose) || "(leer)"
      );
    case "fundament":
      return (
        [
          formatCharaktere(roman.charaktere).trim() &&
            `## Charaktere\n${formatCharaktere(roman.charaktere).trim()}`,
          roman.weltSchauplaetze.trim() &&
            `## Welt\n${roman.weltSchauplaetze.trim()}\n${roman.weltRegeln.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, budget ?? CLIP.expose) || "(leer)"
      );
    case "graph":
      return ed.wissensGraph
        ? JSON.stringify(ed.wissensGraph, null, 2).slice(
            0,
            budget ?? ASSESS_SOFT_CAP_CHARS,
          )
        : "(leer)";
    case "kapitelgeruest":
    case "grobgeruest":
    case "feingeruest":
    case "plot": {
      // Prefer full structured remirror (assess soft-cap) so Analyse
      // cannot invent off-sample Kapitel work from a CLIP slice.
      const structured = ed.kapitelGeruestStructured;
      const geruestText =
        (structured?.chapters?.length
          ? structuredKapitelGeruestToMarkdown(structured).trim()
          : (ed.kapitelGeruestRaw ?? "").trim());
      const cap = budget ?? ASSESS_SOFT_CAP_CHARS;
      if (!geruestText) return "(leer)";
      const toc =
        structured?.chapters?.length
          ? `# Kapitelübersicht (vollständig)\n${structured.chapters.map((c) => `- Kap. ${c.number}: ${c.title}`).join("\n")}\n\n`
          : "";
      const full = `${toc}${geruestText}`;
      if (full.length <= cap) return full;
      return (
        sampleChapterDocForAssess(
          full,
          cap,
          options?.focusChapterNumbers,
        ) || full.slice(0, cap)
      );
    }
    case "szenenplot":
    case "grobplot":
    case "feinplot":
    case "szenen": {
      const structured = ed.szenenplotStructured;
      const plotText =
        (structured?.chapters?.length
          ? structuredSzenenplotToMarkdown(structured).trim()
          : (roman.manuskriptRaw ?? "").trim());
      const cap = budget ?? ASSESS_SOFT_CAP_CHARS;
      if (!plotText) return "(leer)";
      const toc =
        structured?.chapters?.length
          ? `# Kapitelübersicht (vollständig)\n${structured.chapters.map((c) => `- Kap. ${c.number}: ${c.title} (${c.scenes.length} Szenen)`).join("\n")}\n\n`
          : "";
      const full = `${toc}${plotText}`;
      if (full.length <= cap) return full;
      return (
        sampleChapterDocForAssess(
          full,
          cap,
          options?.focusChapterNumbers,
        ) || full.slice(0, cap)
      );
    }
    case "manuskript":
    case "roman": {
      // Same window as the Bewerter (soft cap, full text below it). Analyse
      // on a CLIP sample (~12 % of a 70k-word MS) could never find what the
      // full-text Bewerter penalised — the two instruments disagreed.
      const prose =
        (stage === "manuskript" ? ed.manuskriptText : ed.romanText) ?? "";
      const cap = budget ?? ASSESS_SOFT_CAP_CHARS;
      const trimmed = prose.trim();
      if (!trimmed) return "(leer)";
      const chapters = parsePlotChapters(trimmed);
      const toc = chapters.length
        ? `# Kapitelübersicht (vollständig)\n${chapters.map((c) => `- Kap. ${c.number}: ${c.title} (${countWords(c.body)} Wörter)`).join("\n")}\n\n`
        : "";
      const full = `${toc}${trimmed}`;
      if (full.length <= cap) return full;
      return (
        sampleChapterDocForAssess(full, cap, options?.focusChapterNumbers) ||
        full.slice(0, cap)
      );
    }
    default:
      return "(leer)";
  }
}

/**
 * Emergency sample when a document exceeds the soft cap: prefer focus
 * chapters, then evenly sample the rest (never used under the soft cap).
 *
 * Budget is split fairly across picked chapters — never fill Kap. 1…N until
 * the cap and silently drop later picks (classic “only first chapters” bug).
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
      const idx = Math.round((i * (remaining.length - 1)) / Math.max(1, slots - 1));
      const ch = remaining[idx]!;
      if (!picked.some((p) => p.number === ch.number)) picked.push(ch);
    }
  }

  picked.sort((a, b) => a.number - b.number);
  const allNums = chapters.map((c) => c.number).join(", ");
  const header = `(Notfall-Auszug ${picked.length}/${chapters.length} Kapitel — Soft-Cap ${budget.toLocaleString("de-DE")} Zeichen; alle Nummern: ${allNums}; im Auszug: ${picked.map((c) => c.number).join(", ")}; Fokus: ${
    focusChapters.length
      ? focusChapters.map((c) => c.number).join(", ")
      : "Streuung"
  })`;
  const sep = "\n\n";
  const perChapter = Math.max(
    500,
    Math.floor((budget - header.length - sep.length * picked.length) / picked.length),
  );
  const parts: string[] = [header];
  for (const ch of picked) {
    const block = formatChapterBlock(ch);
    if (block.length <= perChapter) {
      parts.push(block);
    } else {
      // Keep chapter opening AND chapter ending (where payoffs/hooks live)
      // instead of only the first slice, so assessors do not misread clipped
      // chapters as missing their climax/payoff scene.
      const marker = "\n[…]\n";
      const avail = Math.max(200, perChapter - marker.length);
      const headLen = Math.floor(avail * 0.58);
      const tailLen = Math.max(120, avail - headLen);
      parts.push(
        `${block.slice(0, headLen).trimEnd()}${marker}${block.slice(-tailLen).trimStart()}`,
      );
    }
  }
  return parts.join(sep).slice(0, budget);
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
  belege: ReifegradBeleg[];
};

/**
 * Belege from the model JSON. Accepts the requested shape
 * `{ belege: { logik: [{kapitel,text}], craftA: [...], craftB: [...], craftC: [...] } }`
 * as well as a flat `belege: [{achse,kapitel,text}]` list.
 */
function belegeFromRecord(
  obj: Record<string, unknown>,
  stage: PipelineStage,
): ReifegradBeleg[] {
  const raw = obj.belege ?? obj.evidence ?? obj.begruendung;
  if (!raw) return [];
  if (Array.isArray(raw)) return parseReifegradBelege(raw);
  if (typeof raw !== "object") return [];
  const [craftA, craftB, craftC] = craftDimensionsForStage(stage);
  const slotFor = (key: string): ReifegradBeleg["achse"] | null => {
    const k = normalizeKey(key);
    if (k === "logik" || k === "logikpct" || k === "regeln") return "logik";
    if (k === "crafta" || k === "craftapct" || k === normalizeKey(craftA.key) || k === "a") return "a";
    if (k === "craftb" || k === "craftbpct" || k === normalizeKey(craftB.key) || k === "b") return "b";
    if (k === "craftc" || k === "craftcpct" || k === normalizeKey(craftC.key) || k === "c") return "c";
    return null;
  };
  const flat: unknown[] = [];
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    const achse = slotFor(key);
    if (!achse || !Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        flat.push({ achse, kapitel: [], text: item });
      } else if (item && typeof item === "object") {
        flat.push({ ...(item as Record<string, unknown>), achse });
      }
    }
  }
  return parseReifegradBelege(flat);
}

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
    belege: belegeFromRecord(obj, stage),
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
      belege: [],
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
      belege: [],
    };
  }

  throw new Error(
    "Reifegrad-Antwort ohne auswertbare Prozentwerte — Bewertung fehlgeschlagen.",
  );
}

/** Scores + up to 20 Belege (4 axes × 3–5) fit comfortably; JSON is not starved. */
const ASSESS_MAX_TOKENS_WITH_BELEGE = 6_000;

/**
 * Reasoning effort for scoring. Short artifacts keep the cheap "lowest valid"
 * effort (JSON must not drown in thinking). Manuskript / Roman prose (tens of
 * thousands of words judged against a Szenenplot Soll) needs real reasoning:
 * use the Bewerter role's configured effort, floored at "medium".
 */
function scoringReasoningEffort(input: {
  modelSlug: string;
  stage: ReifegradAssessKey;
  roleStored: string | null | undefined;
}): string | null {
  const lowest = lowestReasoningEffortForScoring(input.modelSlug);
  if (input.stage !== "manuskript" && input.stage !== "roman") return lowest;
  const options = reasoningEffortOptionsForModel(input.modelSlug);
  if (options.length === 0) return null;
  const configured = resolveReasoningEffort(input.modelSlug, input.roleStored);
  const weak = new Set(["none", "minimal", "low"]);
  if (configured && !weak.has(configured)) return configured;
  for (const preferred of ["medium", "high"] as const) {
    if (options.some((o) => o.value === preferred)) return preferred;
  }
  return configured ?? lowest;
}

/** Normalize prose for 1:1 Manuskript↔Roman compare (line endings / trim). */
function normalizeProseForCompare(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Bewerter scores the stage artifact on maturity dimensions (Logik + craft).
 * Idee: Kernkonflikt · Tragfähigkeit · Logik · Schärfe (weighted Gesamt, priority order).
 * Sends the full stage document (soft-cap only as emergency). Short artifacts
 * use the lowest valid reasoning effort; Manuskript/Roman prose gets real
 * reasoning plus the Szenenplot Soll as canon (see `scoringReasoningEffort`).
 * Every score carries Belege per axis (`StageReifegrad.belege`).
 *
 * Product: Manuskript = content-fertig; Roman = Prosa-Oberfläche (Stil-Pass).
 * Identical Manuskript→Roman copy inherits the Manuskript score (no second bar).
 */
export async function assessStageReifegrad(input: {
  roman: RomanKontext;
  stage: ReifegradAssessKey;
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
  const label = REIFEGRAD_ASSESS_LABELS[input.stage];
  const alter = altergruppeLabel(editorial);
  const [craftA, craftB, craftC] = craftDimensionsForAssessKey(input.stage);
  const scoreStage = pipelineStageForAssessKey(input.stage);

  // 1:1 Übernahme: gleiche Prosa wie Manuskript → gleicher Reifegrad (kein Stufen-Cliff).
  if (input.stage === "roman") {
    const ms = normalizeProseForCompare(editorial.manuskriptText ?? "");
    const rt = normalizeProseForCompare(editorial.romanText ?? "");
    const msScore = editorial.reifegrade?.manuskript ?? null;
    if (ms.length >= 80 && rt === ms && msScore) {
      return {
        score: buildStageReifegrad({
          stage: "manuskript",
          regelnPct: msScore.regelnPct,
          erfuelltesBeduerfnisPct: 0,
          vernachlaessigtesBeduerfnisPct: 0,
          stilPct: msScore.stilPct,
          dramaturgiePct: msScore.dramaturgiePct,
          leseflussPct: msScore.leseflussPct,
          modelLabel: `${msScore.modelLabel || "bewerter"} · 1:1 Manuskript`,
          assessedAt: new Date().toISOString(),
          belege: msScore.belege,
        }),
        coverage,
      };
    }
  }

  // Roman: calibrate against Manuskript (content-fertig) when no prior Roman score.
  const previous =
    input.previous ??
    (input.stage === "roman"
      ? (editorial.reifegrade?.roman ?? editorial.reifegrade?.manuskript ?? null)
      : null);
  const previousIsManuskriptAnchor =
    input.stage === "roman" &&
    !input.previous &&
    !editorial.reifegrade?.roman &&
    Boolean(editorial.reifegrade?.manuskript);
  const prevBlock = previous
    ? `# Vorherige Messung (Orientierung — neu bewerten, nicht kopieren)
Gesamt ${previous.gesamtPct}% · Logik ${previous.regelnPct}% · ${craftA.label} ${previous.stilPct}% · ${craftB.label} ${previous.dramaturgiePct}% · ${craftC.label} ${previous.leseflussPct}%
${
  previousIsManuskriptAnchor
    ? "Anker = Manuskript-Reifegrad (Inhalt ist dort fertig). Logik/Dramaturgie nur ändern, wenn die Roman-Prosa Inhalt klar verschiebt; Stil/Lesefluss nur bei klar anderer Prosa-Oberfläche. Keinen künstlichen Abschlag nur weil die Stufe „Roman“ heißt."
    : "Gleiche Prozentwerte sind erlaubt, wenn die Qualität wirklich unverändert ist. Nur bei klarer Verbesserung/Verschlechterung die Werte anpassen — keinen künstlichen Δ erzwingen."
}`
    : "";
  const changeBlock = input.changeSummary?.trim()
    ? `# Gerade geändert\n${input.changeSummary.trim()}`
    : "";
  const coverageNote = coverage.complete
    ? `Das Artefakt unten ist VOLLSTÄNDIG (${formatWordCount(coverage.assessedWords)} Wörter) — bewerte alles, nicht nur den Anfang.`
    : `Hinweis: Notfall-Auszug (${formatWordCount(coverage.assessedWords)} von ${formatWordCount(coverage.sourceWords)} Wörtern) wegen Soft-Cap — trotzdem streng und repräsentativ bewerten.`;

  const { rolle, model } = await resolveRomanKiRolle("bewerter");
  const specAssessPolicy =
    input.stage === "expose" ? specStageAnalyzePolicy("assess") : "";
  const isStructureOrGraph =
    input.stage === "graph" ||
    input.stage === "plot" ||
    input.stage === "kapitelgeruest" ||
    input.stage === "grobgeruest" ||
    input.stage === "feingeruest" ||
    input.stage === "szenen" ||
    input.stage === "szenenplot" ||
    input.stage === "grobplot" ||
    input.stage === "feinplot";
  const isProse = input.stage === "manuskript" || input.stage === "roman";
  const canonRefBlock = isStructureOrGraph
    ? formatStructureCanonReferenceBlock(input.roman, {
        includeGraph: input.stage !== "graph",
      })
    : isProse
      ? formatManuskriptCanonReferenceBlock(input.roman)
      : "";
  const chapterStage = isStructureOrGraph || isProse;
  const belegeShape = `"belege": {
  "logik": [{"kapitel": [${chapterStage ? "6" : ""}], "text": "konkreter Befund mit Zitat/Stelle"}],
  "craftA": [{"kapitel": [], "text": "…"}],
  "craftB": [{"kapitel": [], "text": "…"}],
  "craftC": [{"kapitel": [], "text": "…"}]
}`;

  const userText = `${compliance}
${canonRefBlock ? `\n${canonRefBlock}\n` : ""}
# Altersklasse (verbindlich für die Craft-Dimensionen)
${alter}
lesestufe: ${editorial.lesestufe?.trim() || "—"}

# Stufe
${label} (${input.stage})${
  input.stage === "expose"
    ? "\nSpec = Charaktere + Welt + Exposé zusammen bewerten.\nRoman-Tragfähigkeit: Niedrige Scores, wenn der Spec nur eine Episode trägt oder Downstream zentrale Konflikte/Wendungen erfinden müsste."
    : input.stage === "plot" ||
        input.stage === "kapitelgeruest" ||
        input.stage === "grobgeruest" ||
        input.stage === "feingeruest"
      ? "\nArtefakt = STRUCTURED Kapitelgerüst / Plot-Ereignisplan (Skizze): centralArcs Setup/Peak/Payoff; je Kapitel kernsatz, knappe inhaltKurz, props/events, Threads, arcBeats. Tragfähigkeit bewerten — nicht wie ein fertiges Buch. Offene Threads und Skizzenkürze sind erlaubt. ALLE Kapitel zählen."
      : input.stage === "szenen" ||
          input.stage === "szenenplot" ||
          input.stage === "grobplot" ||
          input.stage === "feinplot"
        ? "\nArtefakt = STRUCTURED Szenenplot (Arcs, Lifecycle, Szenen mit dramaturgy/info_flow/continuity/schreibPrompt). Felder exakt bewerten. ALLE Kapitel zählen — nicht nur Kap. 1–3."
        : input.stage === "roman"
          ? "\nArtefakt = Roman-Prosa (romanText). Das Manuskript ist inhaltlich fertig — Roman ist nur Prosa-Überarbeitung (Stimme, Register, Lesefluss). Logik/Dramaturgie nicht strenger bewerten als beim Manuskript, nur weil die Stufe „Roman“ heißt. Stil/Lesefluss = Prosa-Oberfläche dieser Fassung."
          : input.stage === "manuskript"
            ? "\nArtefakt = Manuskript-Prosa (inhaltlich die fertige Fassung). Roman danach nur noch Stil/Prosa — hier Stoff, Logik, Dramaturgie und lesbare Prosa bewerten."
            : input.stage === "idee"
              ? "\nArtefakt = Ideendokumentation (Konzept-Ebene). Vier Achsen (Priorität): Kernkonflikt, Tragfähigkeit, Logik, Schärfe — kein Kapitelplan, kein Markt-Pitch."
              : input.stage === "graph"
                ? "\nArtefakt = Wissensgraph (nodes/edges/hardInvariants/attrs). Vier Achsen: Logik, Abdeckung, Konkretheit, Vernetzung — Canon-Ledger vor Plot, keine Kapitel/Szenen."
                : ""
}
${specAssessPolicy}

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
${
  input.stage === "idee"
    ? "Idee: kein Leseversprechen/Marketing — Tragfähigkeit = Romanstoff-Potenzial (Escalation/Mitte/Ende), nicht Kapitelzahl."
    : input.stage === "expose"
      ? "Spec: Roman-Tragfähigkeit mitbewerten — Episode ohne Mehrakt-Stoff / Escalation / Endgame-Seed = deutlich unter 75."
      : input.stage === "roman"
        ? "Roman: kein Extra-Abschlag für „noch nicht poliert genug“ auf Logik/Dramaturgie — Inhalt liegt im Manuskript."
        : ""
}
${previous ? "Vergleiche mit der vorherigen Messung nur als Kalibrierung — Flat-Scores sind OK bei unverändertem Niveau." : ""}

Antwort NUR als JSON-Objekt (keine Markdown-Fences, kein Text drumherum):
{"logikPct":0,"craftAPct":0,"craftBPct":0,"craftCPct":0,
${belegeShape}}

Belege (Pflicht — ohne Belege ist der Score ungültig):
- Je Achse 3–5 Belege, die wichtigsten zuerst. Jeder Beleg = ein konkreter Befund (Stärke ODER Schwäche) mit ${chapterStage ? "Kapitelnummer(n) in kapitel und" : ""} kurzem Zitat oder eindeutiger Stelle in text (max. 2 Sätze).
- Belege müssen im Artefakt nachprüfbar sein — keine Pauschalurteile („wirkt stellenweise zäh“), keine erfundenen Stellen.
- Die Prozentzahl muss zu den Belegen passen: unter 50 nur mit mehreren klar benannten Brüchen; über 80 nur, wenn die Belege überwiegend Stärken sind.
${isProse ? "- Logik-Belege prüfen gegen das Szenenplot-Soll oben: Wer-weiß-wann-was, Zeitlinie/Daten, Geld/Beträge, Zustand danach, Darf-nicht. Ein Widerspruch zum Soll ist ein Beleg; eine saubere Umsetzung ebenfalls." : ""}

Dimensionen:
- logikPct: innere Logik, Kontinuität, Ursache/Wirkung, keine Widersprüche zu Figuren/Ort/Fakten${
  input.stage === "expose"
    ? " — Spec: Figuren↔Welt↔Exposé müssen einen Roman ohne Erfindungslücken tragen"
    : input.stage === "idee"
      ? " — Idee: kausale Stimmigkeit von Prämisse/Figurenkern/Setting-Skizze (Konzept-Ebene, kein Kapitelplan)"
      : input.stage === "graph"
        ? " — Wissensgraph (Seed vor Plot): Widerspruchsfreiheit von nodes/edges/attrs/hardInvariants gegenüber Fundament, Weltregeln und Exposé; KEIN Abzug für fehlende Prosa-Szenen, Dialogwitz oder Kapitelnummern (vor dem Plot gilt sinceChapter=0, status=planned)"
        : ""
}
- craftAPct (= ${craftA.key} / ${craftA.label}): ${craftA.brief.split("\n")[0]}
- craftBPct (= ${craftB.key} / ${craftB.label}): ${craftB.brief.split("\n")[0]}
- craftCPct (= ${craftC.key} / ${craftC.label}): ${craftC.brief.split("\n")[0]}

Skala: 0 = fehlt völlig, 40 = ansatzweise, 75 = weitgehend, 100 = klar und belastbar.`;

  const system = `${rolle.systemPrompt}

Zusatzauftrag Reifegrad-Messung (${label}):
Du bist Bewerter:in. Du schreibst nichts um — vier Prozentwerte plus belegte Befunde je Achse als JSON.
Craft-Achsen dieser Stufe: ${craftA.label}, ${craftB.label}, ${craftC.label}.
Altersklasse steuert die Craft-Scores streng mit.
${
  input.stage === "expose"
    ? "Spec: streng bei Roman-Tragfähigkeit — zu dünner Stoff = niedrige Craft-/Logik-Scores."
    : input.stage === "roman"
      ? "Roman = Prosa-Oberfläche; Manuskript trägt den Inhalt. Keinen Stufen-Cliff erfinden."
      : input.stage === "idee"
        ? "Idee: Kernkonflikt, Tragfähigkeit, Logik, Schärfe (Gewichtungs-Reihenfolge) — kein Markt-Pitch."
        : input.stage === "graph"
          ? "Wissensgraph: streng bei dünnen attrs und fehlenden Invarianten — Plot darf Canon-Details nicht erfinden müssen."
          : ""
}
Sei streng und konsistent. Ausgabe: genau ein JSON-Objekt, keine Prosa außerhalb von JSON.`;

  const scoringEffort = scoringReasoningEffort({
    modelSlug: model.modelSlug,
    stage: input.stage,
    roleStored: rolle.reasoningEffort,
  });
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
      maxTokens: ASSESS_MAX_TOKENS_WITH_BELEGE,
      timeoutMs: AI_FETCH_TIMEOUT_MAX_MS,
    },
    {
      systemInstruction: `Du antwortest ausschließlich mit einem JSON-Objekt mit genau diesen Keys (Zahlen 0–100):
logikPct, craftAPct, craftBPct, craftCPct.
Keine Markdown-Fences, keine Erklärung.`,
      userText: `Stufe: ${label}
Altersklasse: ${alter}
${canonRefBlock ? `${canonRefBlock}\n` : ""}${prevBlock}
${changeBlock}
${coverageNote}

Artefakt (vollständig bzw. Soft-Cap-Auszug — gleiches Material wie im ersten Versuch):
${artifact}

Gib jetzt korrektes JSON.`,
      maxTokens: 1_500,
      timeoutMs: AI_FETCH_TIMEOUT_MAX_MS,
    },
  ];

  for (const attempt of attempts) {
    try {
      const raw = await assessCall(attempt);
      const scores = parseScoresFromModel(raw, scoreStage);
      return {
        score: buildStageReifegrad({
          ...scores,
          modelLabel: model.label,
          stage: scoreStage,
          belege: scores.belege,
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
  stage: ReifegradAssessKey,
  score: StageReifegrad,
): RomanEditorial {
  return withStageReifegrad(editorial, stage, score);
}
